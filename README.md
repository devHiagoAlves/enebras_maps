# Enebras - Mapa de Clientes PRO

Mapa interativo do Brasil com design profissional.

## Design Features

- Glassmorphism (blur + transparency)
- Modern color palette (Indigo + Cyan)
- Smooth animations
- Professional typography (Inter)
- Micro-interactions
- Dark theme

## Features

- Interactive map with OpenStreetMap
- Import CSV/Excel
- Export data
- Search with debounce
- Filter by state/city
- Route calculation (OSRM)
- Marker clustering
- Heatmap
- Edit/Delete clients
- Client status (Ativo / PMOC vigente / Pendente) with pin colors
- Last visit tracking + filters
- Multi-stop day route (nearest-neighbor + OSRM)
- Copy service order (Auvo bridge)
- Backup/Restore (JSON)
- Report + print itinerary
- Light/Dark theme
- PWA support

## Technologies

- Leaflet + MarkerCluster + Heat
- IndexedDB
- OSRM (routing)
- Nominatim (geocoding)

## License

MIT

## Changelog

### v7.0 — Modo Campo 📋
- Tela "Visitas" mobile-first: lista do dia (da seleção do roteiro), busca e badges de check-in
- Check-in/out com GPS + hora, resultado (concluída/pendente/retorno), observação e fotos comprimidas
- Ligar (tap-to-call) e Navegar (Google Maps) direto da visita; última visita atualizada no PC
- Botão GPS flutuante (seguir posição), bottom sheet no mapa, pins maiores no touch
- PWA instalável: ícones PNG 192/512, standalone, safe-area; SW v5 com teto de 400 tiles

### v6.2
- Roteiro com clientes escolhidos a dedo (checkbox no card + destaque no mapa, salva a seleção)

### v6.1
- Sidebar 340px + overlay automático até 1100px
- Modo compacto p/ telas baixas (1366x768): painel rola, busca fixa no topo
- Filtros com rótulos curtos (sem corte)

### v6
- Status de visita por cliente (pins coloridos, badges, filtro)
- Última visita (campo, filtro +30/60/90 dias, exibição "há X dias")
- Busca tolerante a acentos ("Sao Paulo" acha "São Paulo")
- Roteiro do dia multi-paradas (vizinho mais próximo + OSRM, até 12)
- Botão Copiar OS (ponte para o Auvo)
- Backup JSON em 1 clique + restauração com upsert
- Relatório da carteira (KPIs, status, estados, top cidades) + copiar/imprimir
- Tema claro + impressão de roteiro/relatório
- Segurança: SRI nos CDNs, anti CSV-injection, escape no avatar

### v5
- Filtros (busca/estado/cidade) agora filtram os marcadores do mapa
- Toggle de clusters mostra pins individuais em vez de esvaziar o mapa
- Botão de heatmap funcionando (segue os filtros ativos)
- Geocodificação por endereço completo, com fallback para cidade/UF
- Chave anti-duplicada inclui endereço (migração automática da base antiga)
- Export CSV com BOM (acentos corretos no Excel)
- Modal usa ID do cliente (editar/excluir sempre no registro certo)
- GeoJSON dos estados local (`brasil-estados.geojson`), remoto como fallback
- Service worker com cache real (app funciona offline)
- Build corrigido: inclui `routes.js`, minificação segura
- `favicon.svg` adicionado
