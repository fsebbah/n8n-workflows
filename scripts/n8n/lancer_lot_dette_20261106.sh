#!/usr/bin/env bash
#
# Réimport du lot « dette & observabilité » du 2026-11-06 — PR #553 → #558.
#
#     scripts/n8n/lancer_lot_dette_20261106.sh            # blanc, puis confirmation
#     scripts/n8n/lancer_lot_dette_20261106.sh --verifier  # vérifications seules
#
# ⚠️ CE FICHIER EST LE SCRIPT, PAS LA LISTE. Ne jamais le passer à
#    `batch-reimport` : il attend `reimport-dette-20261106.txt`, le fichier-liste.
#    Erreur commise le 2026-11-06 quand les deux s'appelaient presque pareil —
#    192 lignes de bash prises pour des noms de workflow. Sans dégât, et
#    désormais refusé d'emblée par le garde-fou de la PR #561.
#
# Huit workflows, un seul passage. Le réimport est un UPDATE EN PLACE par nom
# (`batch_reimport_single` → PUT), donc les IDs et les activations sont préservés.
#
# ⚠️ AUCUN redémarrage de Docker n'est nécessaire — vérifié le 2026-11-06 :
#    • les workflows arrivent par l'API, et n8n réenregistre ses webhooks à
#      l'activation, sans relancer le conteneur ;
#    • aucune variable d'environnement nouvelle : le seul nœud qui en lit une
#      (`Tracer l'échec` → REDIS_XADD_SERVICE_URL) la trouve déjà définie ;
#    • aucun chemin ni verbe de webhook ne change, donc pas de risque de 409
#      « conflict with one of the webhooks ».
#
# ⚠️ `batch-reimport` n'existe QUE dans n8n_api.py. `n8n_api.sh` n'a pas cette
#    action (list/get/activate/deactivate/test-webhook/import/search/update).

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LISTE="$RACINE/scripts/n8n/reimport-dette-20261106.txt"
API="python3 $RACINE/scripts/n8n/n8n_api.py"

cd "$RACINE" || exit 1

gras() { printf '\n\033[1m%s\033[0m\n' "$*"; }
vert() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
rouge() { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# ─────────────────────────────────────────────────────────────────────────────
# Vérifications post-réimport : « mergé » ≠ « live », et « actif » ≠ « à jour ».
# On contrôle que les nœuds ATTENDUS sont en base, pas seulement que le
# workflow répond.
# ─────────────────────────────────────────────────────────────────────────────
verifier() {
  gras "Vérification en base — les nœuds attendus sont-ils déployés ?"
  python3 - <<'PY'
import json, sys, urllib.request, urllib.error, collections, re

env = {}
for ligne in open('.env.local'):
    ligne = ligne.strip()
    if '=' in ligne and not ligne.startswith('#'):
        cle, val = ligne.split('=', 1)
        env[cle] = val.strip().strip('"').strip("'")

base = env['N8N_API_URL'].rstrip('/')
entetes = {'X-N8N-API-KEY': env['N8N_API_KEY']}

# Pagination obligatoire : le parc dépasse 250 (c'est tout le sujet de #543).
tous, curseur = [], None
while True:
    url = f'{base}/workflows?limit=250' + (f'&cursor={curseur}' if curseur else '')
    d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=entetes), timeout=60))
    tous += d['data']
    curseur = d.get('nextCursor')
    if not curseur:
        break

par_nom = collections.defaultdict(list)
for w in tous:
    par_nom[w['name']].append(w)

# Ce que CHAQUE réimport doit avoir déposé. Un marqueur par PR, choisi pour être
# absent de la version précédente : un workflow « actif » peut porter l'ancien code.
ATTENDU = {
    'MCP - PDF OCR': [
        ('Validate Input',            r'INPUT_IMAGE'),
        ('Normalize Mistral (Sync)',  r'LE REPÈRE DES bbox'),
        ('Normalize Mistral (Async)', r'avertissementsEntree'),
        ('Normalize Google (Sync)',   r'avertissementsEntree'),
    ],
    'MCP - Image OCR': [
        ('Format Response', r"warnings: \['INPUT_IMAGE'\]"),
        ('Format Response', r'LE REPÈRE DES bbox'),
    ],
    'MCP - Tools - Registry': [
        ('Build Registry', r'EXCLU_DU_CATALOGUE'),
        ('Build Registry', r'_pagination: pagination'),
    ],
    'DOC - Render PDF': [
        ("Tracer l'échec", r'document_render_failed'),
    ],
    'DISCORD - Subject Switch': [
        ('Build Response', r'EXPERT_NOT_CONFIGURED'),
    ],
    'Stripe - Register Project': [
        ('Format Success', r'statutReel442'),
    ],
    'GUILD - Server Sync': [
        ('Validate Data',   r'valid: false'),
        ('Format Réponse',  r'statutReel442'),
    ],
    # n8n-workflows#560 : le `=` d'expression retiré du verbe, que le registre
    # publiait verbatim à MCP sous la forme `method: "=POST"`.
    'Torah Result Store': [
        ('POST Store', r'"httpMethod": "POST"'),
    ],
}

echecs = 0
for nom, controles in ATTENDU.items():
    exemplaires = par_nom.get(nom, [])
    if not exemplaires:
        print(f'  ✗ {nom} : ABSENT de la base')
        echecs += 1
        continue
    # ⚠️ Lister TOUS les exemplaires : un doublon homonyme obsolète qui survit a
    # déjà fait croire à un réimport raté (2026-07-28). batch-reimport met à jour
    # le PREMIER ; un second exemplaire est un signal, pas un détail.
    if len(exemplaires) > 1:
        print(f'  ✗ {nom} : {len(exemplaires)} EXEMPLAIRES — doublon')
        for w in exemplaires:
            print(f'        id={w["id"]} actif={w["active"]}')
        echecs += 1

    w = exemplaires[0]
    detail = json.load(urllib.request.urlopen(
        urllib.request.Request(f'{base}/workflows/{w["id"]}', headers=entetes), timeout=60))
    noeuds = {n['name']: json.dumps(n.get('parameters', {}), ensure_ascii=False)
              for n in detail.get('nodes', [])}
    manque = []
    for nom_noeud, motif in controles:
        if nom_noeud not in noeuds:
            manque.append(f'nœud « {nom_noeud} » absent')
        elif not re.search(motif, noeuds[nom_noeud]):
            manque.append(f'« {nom_noeud} » ne porte pas {motif}')
    if manque:
        print(f'  ✗ {nom} (id={w["id"]}, actif={w["active"]})')
        for m in manque:
            print(f'        {m}')
        echecs += 1
    else:
        etat = 'actif' if w['active'] else '⚠️ INACTIF'
        print(f'  ✓ {nom}  id={w["id"]}  {etat}')
        if not w['active']:
            echecs += 1

# Le câblage de GUILD - Server Sync change : six connexions attendues.
g = par_nom.get('GUILD - Server Sync', [])
if g:
    d = json.load(urllib.request.urlopen(
        urllib.request.Request(f'{base}/workflows/{g[0]["id"]}', headers=entetes), timeout=60))
    liens = {k: [x['node'] for s in v.get('main', []) for x in (s or [])]
             for k, v in (d.get('connections') or {}).items()}
    voulu = {
        'Webhook Trigger': ['Validate Data'],
        'Validate Data': ['Données valides ?'],
        'Données valides ?': ['Sync to Backend', 'Respond Error'],
        'Sync to Backend': ['Format Réponse'],
        'Format Réponse': ['Respond Success'],
    }
    ecarts = [f'{k} → {liens.get(k)} (attendu {v})' for k, v in voulu.items() if liens.get(k) != v]
    if ecarts:
        print('  ✗ GUILD - Server Sync : câblage incomplet')
        for e in ecarts:
            print(f'        {e}')
        echecs += 1
    else:
        print('  ✓ GUILD - Server Sync : les 5 liens attendus sont en base')

print()
sys.exit(1 if echecs else 0)
PY
  local code=$?

  gras "Vérification du catalogue en service (PR #555 : 226 → 237)"
  python3 - <<'PY'
import json, urllib.request, sys
env = {}
for ligne in open('.env.local'):
    ligne = ligne.strip()
    if '=' in ligne and not ligne.startswith('#'):
        c, v = ligne.split('=', 1)
        env[c] = v.strip().strip('"').strip("'")
try:
    d = json.load(urllib.request.urlopen(urllib.request.Request(
        'http://llm.local:5678/webhook/mcp/tools/registry',
        headers={'X-N8N-API-KEY': env['N8N_API_KEY']}), timeout=90))
except Exception as e:
    print(f'  ✗ registre injoignable : {e}')
    sys.exit(1)

total = d.get('total_tools')
pag = d.get('_pagination')
corpus = [k for k in d.get('tools', {}) if k.startswith('torah-corpus')]
majuscules = [k for k in ('torah-get-page', 'torah-search', 'torah-index') if k in d.get('tools', {})]

ok = True
print(f'  total_tools : {total}')
print(f'  _pagination : {pag}')
if pag is None:
    print('  ✗ _pagination absent — PR #552/#555 pas en service'); ok = False
elif pag.get('tronque'):
    print('  ✗ tronque=true — LE CATALOGUE EST AMPUTÉ, ne pas bâtir d\'allowlist dessus'); ok = False
else:
    print(f'  ✓ pagination saine ({pag.get("pages")} page(s), {pag.get("workflows")} workflows)')
if corpus:
    print(f'  ✗ torah-corpus-* encore publiés : {corpus}'); ok = False
else:
    print('  ✓ aucun torah-corpus-* dans le catalogue')
if len(majuscules) == 3:
    print('  ✓ les « TORAH - … » sont revenus (torah-get-page, torah-search, torah-index)')
else:
    print(f'  ✗ TORAH - … manquants : attendu 3, trouvé {len(majuscules)}'); ok = False
if total != 237:
    print(f'  ⚠️  total_tools = {total}, attendu 237 — normal si le parc a bougé depuis le 06/11,'
          '\n      anormal sinon. Comparer avec le nombre de workflows actifs.')
sys.exit(0 if ok else 1)
PY
  local code2=$?

  if [ "$code" -eq 0 ] && [ "$code2" -eq 0 ]; then
    gras "✅ Tout est en service."
    return 0
  fi
  gras "❌ Au moins une vérification a échoué — voir ci-dessus."
  return 1
}

if [ "${1:-}" = "--verifier" ]; then
  verifier
  exit $?
fi

# ─────────────────────────────────────────────────────────────────────────────
gras "Workflows du lot (fichier-liste : $LISTE)"
sed 's/^/  /' "$LISTE"

gras "1/3 · Passage à blanc"
# ⚠️ Chaque entrée doit afficher « Found existing » puis « Would UPDATE … preserves ID ».
# Un « Would delete », ou l'absence d'existant, annonce un DOUBLON (défaut #386) :
# arrêter là plutôt que de créer un second exemplaire dont l'activation échouera en 409.
$API batch-reimport "$LISTE" --dry-run
echo
if $API batch-reimport "$LISTE" --dry-run 2>/dev/null | grep -qi 'would delete'; then
  rouge "Le passage à blanc annonce une SUPPRESSION. Arrêt — ce serait un doublon (#386)."
  exit 1
fi
vert "aucune suppression annoncée"

gras "2/3 · Réimport réel"
printf '  Tout est en UPDATE en place. Continuer ? [oui/NON] '
read -r reponse
case "$reponse" in
  oui|OUI|o|O|y|Y|yes) ;;
  *) echo "  Annulé, rien n'a été écrit."; exit 0 ;;
esac
$API batch-reimport "$LISTE"

gras "3/3 · Vérification"
verifier
