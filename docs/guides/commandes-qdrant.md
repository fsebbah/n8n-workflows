  # Compter les points
curl -s "http://host3.local:20001/collections/tools_index" -H "api-key: 698f353cf9db59c9aee8def9d6d33477" | jq '.result.points_count'

  # Lister tous les noms
curl -s -X POST "http://host3.local:20001/collections/tools_index/points/scroll" \
-H "api-key: 698f353cf9db59c9aee8def9d6d33477" -H "Content-Type: application/json" \
-d '{"limit": 200, "with_payload": {"include": ["name"]}, "with_vector": false}' | jq -r '.result.points[].payload.name'

  # Filtrer par catégorie
curl -s -X POST "http://host3.local:20001/collections/tools_index/points/scroll" \
-H "api-key: 698f353cf9db59c9aee8def9d6d33477" \
-H "Content-Type: application/json" \
-d '{"limit": 50, "filter": {"must": [{"key": "category", "match": {"value": "torah"}}]}, "with_payload":true, "with_vector": false}' | jq '.result.points[].payload.name'

  # Recherche sémantique (nécessite un embedding)
curl -s -X POST "http://host3.local:20001/collections/tools_index/points/search" -H "api-key: 698f353cf9db59c9aee8def9d6d33477" -H "Content-Type: application/json" -d '{"vector": [0.1, 0.2, ...], "limit": 5, "with_payload": true}'

L'exécution continue. Vérifie le nombre de points de temps en temps :
curl -s "http://host3.local:20001/collections/tools_index" -H "api-key: 698f353cf9db59c9aee8def9d6d33477" | jq '.result.points_count'


