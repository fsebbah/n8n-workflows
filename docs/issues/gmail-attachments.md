# Gmail - Support des pièces jointes

## Problème

Le node `GmailToolDynamic` ne supporte pas l'envoi de pièces jointes.

### Format envoyé par le script

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "send",
  "to": "recipient@example.com",
  "subject": "Email avec pièce jointe",
  "body": "Contenu du message",
  "attachments": [
    {
      "filename": "Livre-blanc-azy-solutions.pdf",
      "content": "base64_encoded_content...",
      "mimeType": "application/pdf"
    }
  ]
}
```

### Code actuel (ne gère pas les attachments)

Fichier : `custom-nodes/n8n-nodes-gmail-dynamic/nodes/GmailToolDynamic/GmailToolDynamic.node.ts`

Lignes 438-464 (opération `send`) :

```typescript
case 'send': {
  const to = this.getNodeParameter('to', itemIndex) as string;
  const subject = this.getNodeParameter('subject', itemIndex) as string;
  const body = this.getNodeParameter('body', itemIndex) as string;
  const cc = this.getNodeParameter('cc', itemIndex, '') as string;
  const bcc = this.getNodeParameter('bcc', itemIndex, '') as string;

  const emailLines = [
    `To: ${to}`,
  ];
  if (cc) emailLines.push(`Cc: ${cc}`);
  if (bcc) emailLines.push(`Bcc: ${bcc}`);
  emailLines.push(
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  );

  const encodedEmail = Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return gmailRequest.call(this, accessToken, 'POST', '/messages/send', { raw: encodedEmail });
}
```

## Solution

### 1. Ajouter le paramètre `attachments` dans les properties

```typescript
{
  displayName: 'Attachments',
  name: 'attachments',
  type: 'json',
  displayOptions: {
    show: { resource: ['message', 'draft'], operation: ['send', 'create'] },
  },
  default: '[]',
  description: 'Array of attachments: [{"filename": "file.pdf", "content": "base64...", "mimeType": "application/pdf"}]',
},
```

### 2. Modifier la fonction `send` pour créer un email MIME multipart

```typescript
case 'send': {
  const to = this.getNodeParameter('to', itemIndex) as string;
  const subject = this.getNodeParameter('subject', itemIndex) as string;
  const body = this.getNodeParameter('body', itemIndex) as string;
  const cc = this.getNodeParameter('cc', itemIndex, '') as string;
  const bcc = this.getNodeParameter('bcc', itemIndex, '') as string;
  const attachmentsJson = this.getNodeParameter('attachments', itemIndex, '[]') as string;

  let attachments: Array<{filename: string; content: string; mimeType: string}> = [];
  try {
    attachments = JSON.parse(attachmentsJson);
  } catch (e) {
    // Si c'est déjà un array (passé depuis le webhook body)
    if (Array.isArray(attachmentsJson)) {
      attachments = attachmentsJson as any;
    }
  }

  let encodedEmail: string;

  if (attachments.length === 0) {
    // Email simple sans pièce jointe
    const emailLines = [`To: ${to}`];
    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    emailLines.push(
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    );
    encodedEmail = Buffer.from(emailLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } else {
    // Email MIME multipart avec pièces jointes
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const headers = [
      `To: ${to}`,
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);
    headers.push(
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
    );

    // Body part
    const bodyPart = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
    ];

    // Attachment parts
    const attachmentParts: string[] = [];
    for (const attachment of attachments) {
      attachmentParts.push(
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.content, // déjà en base64
      );
    }

    // Closing boundary
    const closing = `--${boundary}--`;

    const fullEmail = [
      ...headers,
      ...bodyPart,
      ...attachmentParts,
      closing,
    ].join('\r\n');

    encodedEmail = Buffer.from(fullEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  return gmailRequest.call(this, accessToken, 'POST', '/messages/send', { raw: encodedEmail });
}
```

### 3. Mettre à jour le workflow

Dans `sendMessage` node, mapper le paramètre attachments :

```
attachments: ={{ $json.body.attachments || '[]' }}
```

## Tests

```bash
# Envoyer un email avec pièce jointe
curl -X POST http://pi6.local:5678/webhook/mcp-gmail \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "message",
    "operation": "send",
    "to": "recipient@example.com",
    "subject": "Test avec PJ",
    "body": "Voici le document demandé.",
    "attachments": [
      {
        "filename": "document.pdf",
        "content": "JVBERi0xLjQK...",
        "mimeType": "application/pdf"
      }
    ]
  }'
```

## Fichiers à modifier

1. `custom-nodes/n8n-nodes-gmail-dynamic/nodes/GmailToolDynamic/GmailToolDynamic.node.ts`
   - Ajouter property `attachments`
   - Modifier fonction `send` pour MIME multipart

2. `workflows/mcp/Gmail_MCP_Server.json`
   - Mettre à jour le node `sendMessage` pour mapper `attachments`

## Références

- [Gmail API - Messages.send](https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send)
- [RFC 2045 - MIME](https://tools.ietf.org/html/rfc2045)
