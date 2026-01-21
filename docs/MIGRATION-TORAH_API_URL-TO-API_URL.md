# Migration TORAH_API_URL → API_URL

## Contexte
La variable d'environnement `TORAH_API_URL` doit être renommée en `API_URL` pour plus de généricité.

**Total : 66 fichiers, ~95 occurrences**

---

## Par catégorie

### BOOKS (5 fichiers, 14 URLs)

#### Books-Translation-Worker.json (4 URLs)
| Ligne | Endpoint |
|-------|----------|
| 78 | `/api/jobs/{jobId}` |
| 278 | `/api/translations/save` |
| 312 | `/api/jobs/{jobId}` |
| 359 | `/api/jobs/{jobId}` |

#### Books-Commentary-Worker.json (4 URLs)
| Ligne | Endpoint |
|-------|----------|
| 78 | `/api/jobs/{jobId}` |
| 278 | `/api/translations/save` |
| 312 | `/api/jobs/{jobId}` |
| 359 | `/api/jobs/{jobId}` |

#### Books-Translation-Manager.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/books/{text}/{chapter}` |
| 162 | `/api/jobs` |

#### Books-Translate-Commentaries.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/books/{text}/{chapter}/commentaries` |
| 162 | `/api/jobs` |

#### Books-Job-Status.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/jobs/{jobId}` |

---

### TORAH (15 fichiers, 28 URLs)

#### Torah-Translate-Page-Worker.json (4 URLs)
| Ligne | Endpoint |
|-------|----------|
| 78 | `/api/jobs/{jobId}` |
| 278 | `/api/translations/save` |
| 312 | `/api/jobs/{jobId}` |
| 346 | `/api/jobs/{jobId}` |

#### Torah-Translate-Worker.json (3 URLs)
| Ligne | Endpoint |
|-------|----------|
| 78 | `/api/jobs/{jobId}` |
| 403 | `/api/translations/save` |
| 437 | `/api/jobs/{jobId}` |

#### Torah-Vocalization-Nekudot.json (3 URLs)
| Ligne | Endpoint |
|-------|----------|
| 117 | `/api/vocalization/search` |
| 291 | `/api/vocalization/save` |
| 420 | `/api/commentaries/nekudot` |

#### Torah-Translate-Page.json (3 URLs)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/talmud/page/{traite}/{page}/segments` |
| 191 | `/api/talmud/text/{traite}/{page}` |
| 259 | `/api/jobs` |

#### Torah-Translation-Status.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/talmud/traite/{traite}/pages` |
| 108 | `/api/talmud/traites` |

#### Torah-Discord-Translation-v2-Unified.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 117 | `/api/translations/search` |
| 198 | `/api/jobs` |

#### Torah-PDF-Generation.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 88 | `/api/translations` |
| 150 | `/api/pdf/generate` |

#### Torah-List.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 40 | `/api/talmud/traites` |
| 58 | `/api/texts/projects` |

#### Torah-Batch-Translation-with-Commentaries.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 70 | `/api/source-texts` |
| 133 | `/api/translate-with-comments` |

#### Torah-Job-Status.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/jobs/{jobId}` |

#### Torah-Validate-Text.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/sefaria/texts/search` |

#### Torah-Translation-Orchestrator.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 119 | `/api/translate-with-comments` |

#### Torah-Review-and-Validation.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 152 | `/api/translations/{id}/status` |

#### Torah-Get-Page-Translations.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 85 | `/api/talmud/page/{traite}/{page}/segments` |

#### Torah-Discord-Translation-Pivot.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 418 | `/api/translations/save` |

#### Torah-Discord-Bot---Commentary-Search.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 79 | `/api/talmud/text/{traite}/{page}` |

---

### MCP (3 fichiers, 5 URLs)

#### MCP---Image-OCR.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 201 | `/api/v2/jobs` |
| 242 | `/api/v2/jobs/{jobId}` |

#### MCP---PDF-Layout-Translator.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/jobs` |
| 231 | `/api/jobs/{jobId}` |

#### MCP-Qdrant---Save.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 222 | `/api/entities/{type}` |

---

### SHOPPING (17 fichiers, 19 URLs)

#### SHOPPING---Cart-Checkout-Success.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 76 | `/api/checkout/confirm` |
| 138 | `/api/discord/send-dm` |

#### SHOPPING---Profile-Get.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/profile/{user_id}` |

#### SHOPPING---Cart-Add.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}/add` |

#### SHOPPING---Shipping-Calculate.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/shipping/{user_id}/calculate` |

#### SHOPPING---Profile-Address-Set-Default.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/addresses/{user_id}/{address_id}/default` |

#### SHOPPING---Cart-Apply-Coupon.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}/coupon` |

#### SHOPPING---Cart-Checkout.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/checkout/{user_id}` |

#### SHOPPING---Products-Persist.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/products/bulk-create` |

#### SHOPPING---Cart-Update.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}/items/{item_id}` |

#### SHOPPING---Cart-Clear.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}` |

#### SHOPPING---Cart-Remove-Coupon.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}/coupon` |

#### SHOPPING---Profile-Address-Update.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/addresses/{user_id}/{address_id}` |

#### SHOPPING---Profile-Address-Remove.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/addresses/{user_id}/{address_id}` |

#### SHOPPING---Cart-Remove.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/cart/{user_id}/items/bulk-delete` |

#### SHOPPING---Profile-Address-Add.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/addresses/{user_id}` |

#### SHOPPING---Cart-Get.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 72 | `/api/cart/{user_id}` |

#### SHOPPING---Profile-Update.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 61 | `/api/profile/{user_id}` |

#### SHOPPING---Orders-List.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 72 | `/api/orders/{user_id}` |

#### SHOPPING---Cart-Checkout-Cancel.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 76 | `/api/branding/{project_id}` |

---

### CONFIG (5 fichiers, 10 URLs)

#### CONFIG---On-Branding-Update.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |
| 117 | `/api/config/branding` |

#### CONFIG---Get-Help.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |
| 117 | `/api/config/help` |

#### CONFIG---On-Help-Update.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |
| 117 | `/api/config/help` |

#### CONFIG---Get-Branding.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |
| 117 | `/api/config/branding` |

#### CONFIG---Help-Reset.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |

---

### STRIPE (4 fichiers, 5 URLs)

#### Stripe---Webhook-Handler.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 86 | `/api/stripe/verify/{project_id}` |
| 206 | `/api/webhook/account/{action}` |

#### Stripe---Subscription-Success.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 128 | `/api/discord/send-dm` |

#### Stripe---Subscription-Payment-Failure.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 160 | `/api/discord/send-dm` |

#### Stripe---Subscription-Cancel.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 145 | `/api/discord/send-dm` |

---

### DISCORD (2 fichiers, 2 URLs)

#### DISCORD---Billing-Portal.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 84 | `/api/webhook/account` |

#### DISCORD---Get-Subscriber.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 83 | `/api/webhook/account` |

---

### ENTITIES (2 fichiers, 6 URLs)

#### Entitity---List.json (3 URLs)
| Ligne | Endpoint |
|-------|----------|
| 205 | `/api/entities/{type}/user/{user_id}` |
| 231 | `/api/entities/{type}/{id}` |
| 258 | `/api/entities/{type}/{id}` |

#### ENTITIES---Social-Actions.json (3 URLs)
| Ligne | Endpoint |
|-------|----------|
| 84 | `{api_base_path}/{entity_id}` |
| 307 | `{api_url}` |
| 482 | `{api_base_path}/{entity_id}/favorite` |

---

### CHANNELS (4 fichiers, 4 URLs)

#### CHANNELS---Private-Register-Callback.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/channels/private` |

#### CHANNELS---Private-Check-Or-Create.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/channels/private/{user_id}` |

#### CHANNELS---Private-Handle-Unknown-Channel.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 74 | `/api/channels/private/{user_id}` |

#### CHANNELS---Private-Recovery.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 105 | `/api/channels/private` |

---

### MENTION (2 fichiers, 2 URLs)

#### MENTION---On-Mention-Handler.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/branding/guild/{guild_id}` |

#### MENTION---Format-Response.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 69 | `/api/mention/log` |

---

### GUILD (1 fichier, 2 URLs)

#### GUILD---On-Startup-Register.json (2 URLs)
| Ligne | Endpoint |
|-------|----------|
| 73 | `/api/guild/{guild_id}/check` |
| 117 | `/api/guild/register` |

---

### MEMBERS (1 fichier, 1 URL)

#### MEMBERS---On-Join-Grant-Credits.json (1 URL)
| Ligne | Endpoint |
|-------|----------|
| 62 | `/api/webhook/account/init` |

---

## Résumé par catégorie

| Catégorie | Fichiers | URLs |
|-----------|----------|------|
| Torah | 15 | 28 |
| Shopping | 17 | 19 |
| Books | 5 | 14 |
| Config | 5 | 10 |
| Entities | 2 | 6 |
| MCP | 3 | 5 |
| Stripe | 4 | 5 |
| Channels | 4 | 4 |
| Mention | 2 | 2 |
| Discord | 2 | 2 |
| Guild | 1 | 2 |
| Members | 1 | 1 |
| **TOTAL** | **61** | **~98** |

---

## Modification via n8n UI

Pour chaque workflow :
1. Ouvrir le workflow dans n8n
2. Cliquer sur chaque noeud HTTP Request
3. Remplacer `$env.TORAH_API_URL` par `$env.API_URL`
4. Sauvegarder

---

## Commande pour corriger automatiquement (optionnel)

```bash
cd /home/fsebb/n8n-workflows/workflows

# Remplacer TORAH_API_URL par API_URL
find . -name "*.json" -exec sed -i 's/TORAH_API_URL/API_URL/g' {} \;
```

**Attention :** Après modification des fichiers JSON, il faut ré-importer les workflows dans n8n.
