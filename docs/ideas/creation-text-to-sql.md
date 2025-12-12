C'est un cas d'usage **critique** et très demandeur en termes de rigueur. Un CRM (comme Salesforce, HubSpot, ou une base SQL maison), c'est complexe : il y a des centaines de tables, des noms de colonnes obscurs (ex: `c_prop_val_01` au lieu de `email`) et des données sensibles.

Pour réussir du **Text-to-SQL sur un CRM** avec Gemini, vous ne devez pas simplement lui dire "Écris du SQL". Vous devez construire une architecture robuste.

Voici l'approche recommandée dans les dépôts Google Cloud (type `fsebbah/generative-ai`), adaptée spécifiquement pour un CRM.

### 1\. Le Principe Fondamental : "Schema-Only Context"

**Règle d'or :** Ne donnez JAMAIS les données réelles (les lignes de la base) dans le prompt. Donnez uniquement la **structure** (le DDL : `CREATE TABLE...`).

Pourquoi ?

1.  **Sécurité :** L'IA ne voit pas les données clients, elle devine juste comment les chercher.
2.  **Contexte :** Vous économisez des tokens.

### 2\. L'Architecture du Workflow (4 Étapes)

Dans le repo, cela se trouve généralement sous `use-cases/sql-generation`. Voici comment l'adapter :

1.  **User Query :** "Quels clients à Paris ont acheté pour plus de 5000€ le mois dernier ?"
2.  **Schema Selection (RAG) :** (Optionnel mais vital pour les gros CRM) Si votre CRM a 200 tables, n'envoyez pas tout. Utilisez une étape intermédiaire pour identifier que seules les tables `CLIENTS` et `COMMANDES` sont utiles.
3.  **SQL Generation :** Gemini reçoit le schéma de ces 2 tables + la question -\> Il génère le SQL.
4.  **Execution :** Votre script Python exécute le SQL sur la base (en lecture seule).
5.  **Interpretation :** Gemini reçoit le résultat (JSON/CSV) et rédige la réponse en français.

### 3\. Le Code Concret (Le Prompt Système "CRM")

Voici le code Python optimisé pour éviter les hallucinations de colonnes, problème fréquent avec les CRM.

````python
import vertexai
from vertexai.generative_models import GenerativeModel

vertexai.init(project="votre-projet", location="us-central1")
model = GenerativeModel("gemini-1.5-pro-002")

# 1. Définition du Contexte (Le Schéma de votre CRM)
# Astuce : Ajoutez des commentaires (-- description) pour aider l'IA à comprendre le jargon métier.
crm_schema = """
TABLE Clients (
  client_id STRING, -- Identifiant unique
  nom_societe STRING,
  ville STRING,
  statut STRING -- Valeurs possibles: 'ACTIF', 'PROSPECT', 'CHURN'
);

TABLE Factures (
  facture_id STRING,
  client_id STRING, -- Clé étrangère vers Clients
  montant_ht FLOAT,
  date_emission DATE,
  est_payee BOOLEAN
);
"""

# 2. Le Prompt Système "Expert SQL"
system_instruction = f"""
Tu es un expert en SQL (dialecte BigQuery/PostgreSQL).
Ton rôle est de traduire des questions en langage naturel en requêtes SQL valides.

Voici le schéma de la base de données CRM :
{crm_schema}

Règles strictes :
1. Utilise UNIQUEMENT les tables et colonnes définies ci-dessus. N'en invente jamais.
2. Si la question est ambiguë (ex: "Meilleurs clients"), utilise le 'montant_ht' pour trier.
3. Retourne SEULEMENT le code SQL, sans balises markdown (```sql) et sans explications avant/après.
4. Utilise toujours des alias de table (ex: c.nom_societe).
"""

# 3. La demande utilisateur
user_question = "Donne-moi la liste des entreprises à Lyon qui sont actives et ont des factures impayées."

# 4. Génération
response = model.generate_content(
    f"{system_instruction}\n\nQuestion: {user_question}"
)

sql_query = response.text.strip()
print("Requête générée :")
print(sql_query)

# --- Sortie attendue ---
# SELECT c.nom_societe 
# FROM Clients c
# JOIN Factures f ON c.client_id = f.client_id
# WHERE c.ville = 'Lyon' 
# AND c.statut = 'ACTIF' 
# AND f.est_payee = FALSE;
````

### 4\. Les 3 "Pièges" du CRM et comment les résoudre

Dans le repo `fsebbah`, il y a des astuces pour gérer la complexité réelle :

#### A. Le problème des "Valeurs Enum" (Data Dictionary)

Si l'utilisateur demande "les clients mécontents", comment l'IA sait-elle que dans votre base, cela correspond à la colonne `score_satisfaction < 3` ou au statut `RISK` ?

  * **Solution :** Dans le prompt système, vous devez injecter un **Glossaire**.
      * *Exemple :* "Note : Si on parle de 'CA', utilise la somme de `montant_ht`. Si on parle de 'Churn', cherche `statut = 'CLOSED'`."

#### B. La Sécurité (Injection SQL)

Ne laissez jamais l'IA exécuter des `DROP` ou `UPDATE`.

  * **Solution :** Créez un utilisateur de base de données spécifique pour l'IA qui a **uniquement** les droits `SELECT` (Read-Only). C'est la seule sécurité viable.

#### C. Les jointures complexes

Les CRM ont des schémas en étoile complexes. Gemini 1.5 Pro est très bon pour les jointures (`JOIN`), mais il peut se perdre si les clés étrangères ne sont pas claires.

  * **Solution :** Spécifiez explicitement les clés de jointure dans la description du schéma dans le prompt (`client_id est la FK vers Clients.id`).

### Prochaine étape : L'Agent SQL

Si vous voulez aller plus loin, vous ne demandez pas juste le SQL, vous utilisez le **Function Calling**.
Vous donnez à Gemini un outil `execute_sql(query)`.

1.  Gemini génère le SQL.
2.  Il appelle l'outil.
3.  Si le SQL échoue (erreur de syntaxe), l'outil renvoie l'erreur à Gemini.
4.  **Gemini se corrige tout seul** ("Ah pardon, la colonne s'appelle `mnt_ht`, je corrige") et relance la requête.

C'est ce qu'on appelle un workflow d'**Auto-Correction**, et c'est indispensable pour un projet Text-to-SQL en production.

Voulez-vous un exemple de code pour cette partie **Auto-Correction** (Retry Loop) ?
