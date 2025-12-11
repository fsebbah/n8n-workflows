/**
 * Script de test pour valider le GenAiClient avec ADC
 * Usage: npx ts-node test-client.ts
 */

import { createVertexAiClientWithAdc, createGcsUploader } from './index';

const PROJECT_ID = 'n8n-genai-480909';
const LOCATION = 'europe-west1';
const GCS_BUCKET = 'n8n-genai-480909-media';
const SERVICE_ACCOUNT = 'n8n-genai-sa@n8n-genai-480909.iam.gserviceaccount.com';

async function testGenAiClient() {
  console.log('=== Test GenAiClient avec ADC ===\n');

  try {
    // Créer le client
    console.log(`Création du client Vertex AI...`);
    console.log(`  Project: ${PROJECT_ID}`);
    console.log(`  Location: ${LOCATION}`);

    const client = createVertexAiClientWithAdc(PROJECT_ID, LOCATION);
    console.log('  Client créé ✓\n');

    // Test génération de texte
    console.log('Test génération de texte (Gemini)...');
    const prompt = 'Dis bonjour en français en une phrase.';
    console.log(`  Prompt: "${prompt}"`);

    const result = await client.generateText(prompt, {
      maxOutputTokens: 100,
      temperature: 0.7,
    });

    console.log(`  Réponse: "${result.text}"`);
    console.log(`  Tokens (input/output): ${result.inputTokens}/${result.outputTokens}`);
    console.log(`  Modèle: ${result.model}`);
    console.log('  Test texte ✓\n');

    return true;
  } catch (error) {
    console.error('ERREUR:', error);
    return false;
  }
}

async function testGcsUploader() {
  console.log('=== Test GcsUploader avec ADC ===\n');

  try {
    // Créer l'uploader avec impersonation pour les URLs signées
    console.log(`Création du GcsUploader...`);
    console.log(`  Bucket: ${GCS_BUCKET}`);
    console.log(`  Impersonate: ${SERVICE_ACCOUNT}`);

    const uploader = createGcsUploader(GCS_BUCKET, undefined, 'generated', SERVICE_ACCOUNT);
    console.log('  Uploader créé ✓\n');

    // Test upload d'un fichier texte
    console.log('Test upload fichier...');
    const testData = Buffer.from('Hello from n8n-nodes-google-genai-core test!');
    const filename = `test-${Date.now()}.txt`;

    const uploadResult = await uploader.upload(testData, filename, 'test-user', 'application/json');

    console.log(`  Path: ${uploadResult.path}`);
    console.log(`  GCS URL: ${uploadResult.gcsUrl}`);
    console.log(`  Signed URL: ${uploadResult.signedUrl.substring(0, 80)}...`);
    console.log(`  Expires: ${uploadResult.expiresAt}`);
    console.log('  Test upload ✓\n');

    // Cleanup - supprimer le fichier test
    console.log('Nettoyage...');
    await uploader.delete(uploadResult.path);
    console.log('  Fichier test supprimé ✓\n');

    return true;
  } catch (error) {
    console.error('ERREUR:', error);
    return false;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  Tests n8n-nodes-google-genai-core');
  console.log('========================================\n');

  const results = {
    genai: await testGenAiClient(),
    gcs: await testGcsUploader(),
  };

  console.log('========================================');
  console.log('  RÉSUMÉ');
  console.log('========================================');
  console.log(`  GenAiClient: ${results.genai ? '✓ OK' : '✗ ÉCHEC'}`);
  console.log(`  GcsUploader: ${results.gcs ? '✓ OK' : '✗ ÉCHEC'}`);
  console.log('========================================\n');

  process.exit(results.genai && results.gcs ? 0 : 1);
}

main();
