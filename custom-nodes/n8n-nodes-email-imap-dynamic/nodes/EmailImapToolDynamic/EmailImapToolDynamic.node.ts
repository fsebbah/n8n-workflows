/**
 * EmailImapToolDynamic — accès IMAP avec identifiants fournis PAR REQUÊTE (BYOT).
 *
 * POURQUOI CE NŒUD EXISTE (azy.daily#645, #646)
 * `POST /webhook/email-imap` rendait, jusqu'au 2026-11-10, `HTTP 200
 * {"success":true,"emails":[],"count":0}` pour un hôte INEXISTANT. Une boîte vide
 * FABRIQUÉE, qu'un agent relaie en « vous n'avez pas de courrier ». Pire qu'une erreur :
 * rien ne la signale. Le workflow a été mis en `501 TOOL_NOT_IMPLEMENTED` en attendant
 * ce nœud.
 *
 * Pourquoi un nœud personnalisé, et pas un nœud Code :
 *   • le bac à sable du nœud Code interdit `require()` — donc aucun client IMAP ;
 *   • `helpers.httpRequest` ne parle pas IMAP (session TCP sur 993, pas du HTTP) ;
 *   • le nœud natif `EmailReadImap` se déclare `group: ['trigger']` : il ne peut que
 *     DÉMARRER un workflow, jamais se placer après un Webhook, et il lit ses identifiants
 *     dans les credentials stockées par n8n — ce qui contredit le BYOT.
 * Un nœud personnalisé porte ses dépendances npm : mécanisme prouvé par
 * `n8n-nodes-google-genai-core`, dont les `@google-cloud/*` sont hissés dans
 * `custom-nodes/node_modules` que `sync-custom-nodes.sh` emporte vers llm.
 *
 * ⚠️ NOMS DES CHAMPS : CEUX D'API, PAS LES MIENS
 * api stocke déjà l'IMAP par compte (`imap_adapter.py:446-462`, chiffré au repos) sous
 * `provider_settings.imap = {server, port, use_ssl}` + `credentials = {username,
 * password}`. Les paramètres ci-dessous sont donc nommés pour se brancher SANS couche de
 * traduction : `imap_server`, `imap_port`, `imap_use_ssl`, `imap_username`,
 * `imap_password`. Ne pas les renommer en host/secure/user : ça recréerait la traduction
 * qu'on évite des deux côtés.
 *
 * ⚠️ CES CHAMPS NE DOIVENT PAS ÊTRE DÉCLARÉS DANS L'InputSchema PUBLIÉ
 * Mesuré par MCP : `param_builder._build_from_schema` ne garde que les champs déclarés,
 * donc un champ hors-schéma est strippé puis réinjecté par le relais — c'est l'effet
 * voulu. Et un champ déclaré est un champ que le LLM REMPLIT, dans un registre publié
 * SANS authentification (236/237 webhooks) et vectorisé dans Qdrant. Un jeton qui expire,
 * passe encore ; un mot de passe de boîte, qui ne périme pas et autorise aussi l'envoi,
 * non.
 *
 * ⚠️ IMAP GARDE UN ÉTAT, LÀ OÙ NOS AUTRES NŒUDS SONT SANS ÉTAT
 * Une connexion est ouverte, verrouillée sur un dossier, puis fermée. Tout est en
 * `finally` : sans ça, une erreur laisse une session ouverte côté serveur, et les
 * fournisseurs plafonnent les connexions simultanées (Gmail : 15). Quelques erreurs
 * suffiraient à verrouiller la boîte de l'utilisateur.
 */
import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  JsonObject,
  NodeOperationError,
} from 'n8n-workflow';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ImapFlow } = require('imapflow');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { simpleParser } = require('mailparser');

/** Remplace tout secret par `***` — y compris dans les messages d'erreur du serveur.
 *
 * ⚠️ MESURÉ LE 2026-11-07 : n8n conserve les données d'exécution, et un secret posé en
 * en-tête est relisible via `GET /executions/<id>?includeData=true`. Les erreurs IMAP
 * citent volontiers la commande émise — donc le mot de passe. Un jeton Google périmé ne
 * vaut rien ; un mot de passe de boîte, si. On nettoie avant de laisser remonter.
 */
export function nettoyer(texte: string, secrets: string[]): string {
  let t = texte;
  for (const s of secrets) {
    if (s && s.length >= 3) t = t.split(s).join('***');
  }
  return t;
}

/** Erreur propre : message nettoyé, pas de pile, pas d'objet serveur recopié. */
function erreurPropre(e: unknown, secrets: string[]): Error {
  const brut = e as { message?: string; responseText?: string; authenticationFailed?: boolean;
                      code?: string; serverResponseCode?: string };
  const message = nettoyer(String(brut?.message ?? e), secrets);
  const err = new Error(message) as Error & { imapCode?: string; authEchouee?: boolean };
  if (brut?.code) err.imapCode = String(brut.code);
  else if (brut?.serverResponseCode) err.imapCode = String(brut.serverResponseCode);
  if (brut?.authenticationFailed) err.authEchouee = true;
  return err;
}

export class EmailImapToolDynamic implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Email IMAP Tool Dynamic',
    name: 'emailImapToolDynamic',
    icon: 'file:imap.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["operation"] }}',
    description: 'IMAP access with per-request connection parameters (BYOT) - Multi-tenant ready',
    defaults: { name: 'Email IMAP Dynamic' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [], // AUCUNE credential statique : tout vient du corps de la requête.
    properties: [
      // ═══ CONNEXION — noms d'api, cf. en-tête ═══════════════════════════════
      {
        displayName: 'IMAP Server',
        name: 'imap_server',
        type: 'string',
        required: true,
        default: '',
        placeholder: '{{ $json.body.imap_server }}',
        description: 'IMAP hostname. Use an expression to read it from the request body.',
      },
      {
        displayName: 'IMAP Port',
        name: 'imap_port',
        type: 'number',
        default: 993,
        placeholder: '{{ $json.body.imap_port }}',
        description: 'Usually 993 (implicit TLS) or 143 (STARTTLS)',
      },
      {
        displayName: 'Use SSL/TLS',
        name: 'imap_use_ssl',
        type: 'boolean',
        default: true,
        description: 'Whether to open the connection with implicit TLS (port 993)',
      },
      {
        displayName: 'IMAP Username',
        name: 'imap_username',
        type: 'string',
        required: true,
        default: '',
        placeholder: '{{ $json.body.imap_username }}',
        description: 'Account username, usually the full email address',
      },
      {
        displayName: 'IMAP Password',
        name: 'imap_password',
        type: 'string',
        typeOptions: { password: true },
        required: true,
        default: '',
        placeholder: '{{ $json.body.imap_password }}',
        description: 'Account password or app-specific password. Never declare this field in a published tool schema.',
      },
      // ═══ OPÉRATION ═════════════════════════════════════════════════════════
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'List Folders', value: 'list_folders', description: 'List the mailboxes of the account' },
          { name: 'Search', value: 'search', description: 'Search messages in a folder and return their envelopes' },
          { name: 'Fetch Email', value: 'fetch_email', description: 'Fetch and parse one message by UID' },
        ],
        default: 'search',
      },
      // ⚠️ UNIQUEMENT DES CLAUSES `show` POSITIVES, JAMAIS DE `hide` À PLUSIEURS CLÉS.
      // n8n lit `show` en ET et `hide` en OU : le 2026-11-10, un
      // `hide: { resource: [...], operation: [...] }` a masqué `courseId` pour TOUTE
      // opération `create`/`getAll` quelle que soit la ressource, et 11 routes Classroom
      // mouraient sur « Could not get parameter "courseId" » AVANT tout appel réseau.
      // Un `show` positif ne peut pas produire ça.
      {
        displayName: 'Folder',
        name: 'folder',
        type: 'string',
        default: 'INBOX',
        displayOptions: { show: { operation: ['search', 'fetch_email'] } },
        description: 'Mailbox path, as returned by List Folders',
      },
      // ── Critères de recherche ─────────────────────────────────────────────
      // ⚠️ PAS de chaîne IMAP brute (« UNSEEN SINCE 1-Jan-2026 ») : il faudrait l'analyser
      // nous-mêmes, et une syntaxe mal formée part au serveur pour revenir en erreur
      // opaque. Des critères nommés sont vérifiables ici, et un agent les remplit sans
      // connaître la grammaire IMAP.
      {
        displayName: 'Unseen Only',
        name: 'searchUnseen',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['search'] } },
        description: 'Whether to return only messages without the \\Seen flag',
      },
      {
        displayName: 'From Contains',
        name: 'searchFrom',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['search'] } },
        description: 'Substring matched against the From header',
      },
      {
        displayName: 'Subject Contains',
        name: 'searchSubject',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['search'] } },
        description: 'Substring matched against the Subject header',
      },
      {
        displayName: 'Since',
        name: 'searchSince',
        type: 'string',
        default: '',
        placeholder: '2026-11-01',
        displayOptions: { show: { operation: ['search'] } },
        description: 'Only messages received on or after this date (ISO 8601)',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 20,
        typeOptions: { minValue: 1, maxValue: 200 },
        displayOptions: { show: { operation: ['search'] } },
        description: 'Max messages to return, most recent first',
      },
      // ── Lecture d'un message ──────────────────────────────────────────────
      {
        displayName: 'UID',
        name: 'uid',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['fetch_email'] } },
        description: 'Message UID, as returned by Search. Not the sequence number.',
      },
      {
        displayName: 'Include Attachment Content',
        name: 'includeAttachmentContent',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['fetch_email'] } },
        description: 'Whether to return attachment bytes as base64. Off by default: a single attachment can exceed the response size a webhook can carry.',
      },
      // ── Délais ────────────────────────────────────────────────────────────
      {
        displayName: 'Connection Timeout (ms)',
        name: 'connectionTimeout',
        type: 'number',
        default: 15000,
        description: 'Abort if the server does not answer within this delay. An unreachable host must fail fast, not hang the webhook.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const retour: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const motDePasse = this.getNodeParameter('imap_password', i, '') as string;
      const utilisateur = this.getNodeParameter('imap_username', i, '') as string;
      const secrets = [motDePasse];
      let client: any = null;

      try {
        const serveur = this.getNodeParameter('imap_server', i, '') as string;
        const port = this.getNodeParameter('imap_port', i, 993) as number;
        const tls = this.getNodeParameter('imap_use_ssl', i, true) as boolean;
        const operation = this.getNodeParameter('operation', i) as string;
        const delai = this.getNodeParameter('connectionTimeout', i, 15000) as number;

        // Vérifier AVANT d'ouvrir une socket : un paramètre vide est une erreur de
        // câblage, pas une erreur réseau, et doit se lire comme telle.
        const manquants: string[] = [];
        if (!serveur) manquants.push('imap_server');
        if (!utilisateur) manquants.push('imap_username');
        if (!motDePasse) manquants.push('imap_password');
        if (manquants.length) {
          throw new NodeOperationError(
            this.getNode(),
            `Paramètres de connexion manquants : ${manquants.join(', ')}. ` +
            'Utiliser des expressions, par ex. {{ $json.body.imap_server }}.',
            { itemIndex: i },
          );
        }

        client = new ImapFlow({
          host: serveur,
          port,
          secure: tls,
          auth: { user: utilisateur, pass: motDePasse },
          // ⚠️ `logger: false` est une mesure de sécurité, pas du confort : le journal
          // d'imapflow recopie les commandes émises, donc le LOGIN et son mot de passe,
          // vers la sortie standard du conteneur.
          logger: false,
          connectionTimeout: delai,
          greetingTimeout: Math.min(delai, 10000),
          socketTimeout: Math.max(delai, 60000),
          // On ne désactive PAS la vérification du certificat : accepter n'importe quel
          // certificat sur un transport qui porte un mot de passe annulerait le TLS.
          tls: { rejectUnauthorized: true },
        });

        await client.connect();
        let resultat: JsonObject;

        if (operation === 'list_folders') {
          const liste = await client.list();
          resultat = {
            folders: liste.map((d: any) => ({
              path: d.path,
              name: d.name,
              delimiter: d.delimiter,
              special_use: d.specialUse ?? null,
              subscribed: !!d.subscribed,
              flags: Array.isArray(d.flags) ? d.flags : [...(d.flags ?? [])],
            })),
            count: liste.length,
          };

        } else if (operation === 'search') {
          const dossier = this.getNodeParameter('folder', i, 'INBOX') as string;
          const limite = this.getNodeParameter('limit', i, 20) as number;
          // ⚠️ PAS `JsonObject` : `since` est un vrai objet Date, qu'imapflow attend
          // tel quel. `JsonObject` interdit Date, et le contourner en chaîne ferait
          // chercher le serveur sur une date qu'il n'interprète pas pareil.
          const criteres: Record<string, unknown> = {};
          if (this.getNodeParameter('searchUnseen', i, false) as boolean) criteres.seen = false;
          const de = (this.getNodeParameter('searchFrom', i, '') as string).trim();
          if (de) criteres.from = de;
          const sujet = (this.getNodeParameter('searchSubject', i, '') as string).trim();
          if (sujet) criteres.subject = sujet;
          const depuis = (this.getNodeParameter('searchSince', i, '') as string).trim();
          if (depuis) {
            const d = new Date(depuis);
            if (Number.isNaN(d.getTime())) {
              throw new NodeOperationError(
                this.getNode(), `\`searchSince\` illisible : ${depuis}. Attendu ISO 8601, par ex. 2026-11-01.`,
                { itemIndex: i },
              );
            }
            criteres.since = d;
          }
          // Aucun critère = tout le dossier. Explicite, parce qu'imapflow lève sur un
          // objet de recherche vide.
          if (Object.keys(criteres).length === 0) criteres.all = true;

          const verrou = await client.getMailboxLock(dossier);
          try {
            const uids: number[] = await client.search(criteres, { uid: true });
            // Les plus récents d'abord : IMAP rend les UID croissants, donc on prend la
            // FIN de la liste. Prendre le début rendrait les plus anciens — le genre
            // d'erreur qu'aucun test de forme n'attrape.
            const retenus = uids.slice(-limite).reverse();
            const messages: JsonObject[] = [];
            if (retenus.length) {
              for await (const m of client.fetch(
                retenus, { uid: true, envelope: true, flags: true, size: true }, { uid: true },
              )) {
                const e = m.envelope ?? {};
                messages.push({
                  uid: m.uid,
                  subject: e.subject ?? null,
                  from: (e.from ?? []).map((a: any) => ({ name: a.name ?? null, address: a.address ?? null })),
                  to: (e.to ?? []).map((a: any) => ({ name: a.name ?? null, address: a.address ?? null })),
                  date: e.date ? new Date(e.date).toISOString() : null,
                  message_id: e.messageId ?? null,
                  size: m.size ?? null,
                  flags: Array.isArray(m.flags) ? m.flags : [...(m.flags ?? [])],
                  seen: [...(m.flags ?? [])].includes('\\Seen'),
                });
              }
            }
            // On réordonne : `fetch` ne garantit pas l'ordre demandé.
            messages.sort((a, b) => Number(b.uid) - Number(a.uid));
            resultat = {
              folder: dossier,
              emails: messages,
              count: messages.length,
              total_matched: uids.length,
              truncated: uids.length > messages.length,
            };
          } finally {
            verrou.release();
          }

        } else if (operation === 'fetch_email') {
          const dossier = this.getNodeParameter('folder', i, 'INBOX') as string;
          const uidBrut = String(this.getNodeParameter('uid', i, '')).trim();
          const uid = Number(uidBrut);
          if (!uidBrut || !Number.isInteger(uid) || uid <= 0) {
            throw new NodeOperationError(
              this.getNode(), `\`uid\` doit être un entier positif, reçu : ${JSON.stringify(uidBrut)}`,
              { itemIndex: i },
            );
          }
          const avecPiecesJointes = this.getNodeParameter('includeAttachmentContent', i, false) as boolean;

          const verrou = await client.getMailboxLock(dossier);
          try {
            const brut = await client.fetchOne(String(uid), { source: true }, { uid: true });
            if (!brut || !brut.source) {
              // ⚠️ On LÈVE, on ne rend pas un message vide : rendre `{}` avec
              // `success: true` est exactement le défaut qu'on corrige ici.
              throw new NodeOperationError(
                this.getNode(), `Aucun message d'UID ${uid} dans « ${dossier} »`, { itemIndex: i },
              );
            }
            const p = await simpleParser(brut.source);
            const pj = (p.attachments ?? []).map((a: any) => ({
              filename: a.filename ?? null,
              content_type: a.contentType ?? null,
              size: a.size ?? null,
              content_id: a.contentId ?? null,
              ...(avecPiecesJointes && a.content
                ? { content_base64: Buffer.from(a.content).toString('base64') }
                : {}),
            }));
            const adr = (x: any) => (x?.value ?? []).map((v: any) => ({
              name: v.name || null, address: v.address || null,
            }));
            resultat = {
              folder: dossier,
              uid,
              subject: p.subject ?? null,
              from: adr(p.from),
              to: adr(p.to),
              cc: adr(p.cc),
              date: p.date ? new Date(p.date).toISOString() : null,
              message_id: p.messageId ?? null,
              in_reply_to: p.inReplyTo ?? null,
              text: p.text ?? null,
              html: typeof p.html === 'string' ? p.html : null,
              attachments: pj,
              attachments_count: pj.length,
              attachments_content_included: avecPiecesJointes,
            };
          } finally {
            verrou.release();
          }

        } else {
          throw new NodeOperationError(
            this.getNode(), `Opération inconnue : ${operation}`, { itemIndex: i },
          );
        }

        retour.push({ json: resultat, pairedItem: i });

      } catch (e) {
        const propre = erreurPropre(e, secrets);
        if (this.continueOnFail()) {
          retour.push({
            json: {
              error: propre.message,
              imap_code: (propre as any).imapCode ?? null,
              auth_failed: !!(propre as any).authEchouee,
            },
            pairedItem: i,
          });
        } else {
          throw propre;
        }
      } finally {
        // ⚠️ TOUJOURS fermer. Une session laissée ouverte compte dans le plafond de
        // connexions simultanées du fournisseur (Gmail : 15) ; quelques erreurs
        // suffiraient à verrouiller la boîte de l'utilisateur. `logout` peut lui-même
        // échouer sur une socket déjà morte — on l'avale, puis on force la fermeture.
        if (client) {
          try { await client.logout(); }
          catch { try { client.close(); } catch { /* socket déjà fermée */ } }
        }
      }
    }

    return [retour];
  }
}
