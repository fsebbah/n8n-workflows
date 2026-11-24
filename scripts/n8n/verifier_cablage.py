#!/usr/bin/env python3
"""Contrôle de cohérence du câblage d'un workflow n8n exporté, avant tout réimport.

Trois défauts qu'un œil ne voit pas sur un JSON de 2 000 lignes, et que n8n
n'annonce qu'à l'exécution :

  1. une connexion qui NOMME un nœud inexistant — n8n importe sans broncher et
     la branche ne se déclenche jamais ;
  2. un nœud ORPHELIN, jamais atteint depuis un déclencheur : du code en place,
     mais mort, exactement le défaut d'azy.daily#642 (`Parse Input` construisait
     trois erreurs qu'aucune connexion ne lisait) ;
  3. une référence `$('Nœud')` vers un nœud absent, qui lève
     « Referenced node is unexecuted » ou « node doesn't exist » en service.

⚠️ Lit `wf['nodes']`, JAMAIS le fichier par grep : un export porte une seconde
copie périmée du câblage dans `activeVersion` (250 workflows sur 269).
"""
import json, re, sys

def controler(chemin):
    wf = json.load(open(chemin))
    noms = {n['name'] for n in wf['nodes']}
    cx = wf.get('connections', {})
    soucis = []

    for source, sorties in cx.items():
        if source not in noms:
            soucis.append(f"connexion depuis un nœud inexistant — {source!r}")
        for branche in sorties.get('main', []) or []:
            for lien in (branche or []):
                if lien['node'] not in noms:
                    soucis.append(f"{source!r} pointe vers un nœud inexistant — {lien['node']!r}")

    # Atteignabilité depuis les déclencheurs (webhook, cron, manuel, sticky exclus).
    # ⚠️ TYPES EXACTS, pas une sous-chaîne. `respondToWebhook` CONTIENT « webhook » :
    # le détecter comme déclencheur ferait des nœuds de réponse des racines, et un
    # nœud mort rattaché à une branche de réponse passerait pour atteignable. Un
    # contrôle qui réussit toujours est pire que pas de contrôle.
    DECLENCHEURS = {'n8n-nodes-base.webhook', 'n8n-nodes-base.scheduleTrigger',
                    'n8n-nodes-base.cron', 'n8n-nodes-base.manualTrigger',
                    'n8n-nodes-base.executeWorkflowTrigger', 'n8n-nodes-base.formTrigger',
                    'n8n-nodes-base.emailReadImap', 'n8n-nodes-base.errorTrigger'}
    depart = [n['name'] for n in wf['nodes'] if n['type'] in DECLENCHEURS]
    vus, pile = set(depart), list(depart)
    while pile:
        cour = pile.pop()
        for branche in cx.get(cour, {}).get('main', []) or []:
            for lien in (branche or []):
                if lien['node'] not in vus:
                    vus.add(lien['node']); pile.append(lien['node'])
    for n in wf['nodes']:
        if n['type'].endswith('stickyNote'):
            continue
        if n['name'] not in vus:
            soucis.append(f"nœud ORPHELIN, jamais atteint — {n['name']!r}")

    # Références $('…') vers des nœuds absents.
    for n in wf['nodes']:
        for ref in set(re.findall(r"\$\(\s*'([^']+)'\s*\)", json.dumps(n.get('parameters', {}), ensure_ascii=False))):
            if ref not in noms:
                soucis.append(f"{n['name']!r} référence $('{ref}') qui n'existe pas")

    etat = '❌' if soucis else '✅'
    print(f"{etat} {chemin}  ({len(wf['nodes'])} nœuds, {len(depart)} déclencheur(s))")
    for s in soucis:
        print(f"     {s}")
    return not soucis

if __name__ == '__main__':
    sys.exit(0 if all(controler(c) for c in sys.argv[1:]) else 1)
