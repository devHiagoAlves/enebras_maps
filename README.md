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

### v8.5 — Login visível (z-index acima do mapa) 🪟
- Overlays de login e OSs estavam atrás dos painéis do Leaflet (invisíveis)
- z-index 2500: acima do mapa e modais, abaixo do loading/toasts

### v8.4 — Tiles via Esri (fim do "API KEY REQUIRED") 🗺️
- CARTO passou a exigir API key nos basemaps; migramos p/ Esri Gray Canvas (sem chave)
- Dark gray no tema escuro, light gray no claro; atribuição Esri/OSM

### v8.1 — Fase A: OS com ciclo de vida 📋
- Tabela `tasks` (código OS-... único, tipo, status, prioridade, técnico, data)
- Painel de OSs: filtros (Abertas/Hoje/Minhas/Finalizadas), Nova OS com geocodificação
- "Roteiro das OSs": a agenda do dia nasce das OSs e a rota carrega os IDs (`task_ids`)
- Check-in → `no_local`, salvar → `em_execução`, check-out → `finalizada`, tudo sozinho

### v8.0 — Login + perfis (estilo Auvo) 👥
- Tela de login (e-mail + senha, Supabase Auth, logins de teste)
- Perfil **adm**: app completo + envia rota escolhendo o técnico na lista
- Perfil **técnico**: vê SÓ "Minhas rotas" + visitas (sidebar oculta)
- Rotas ligadas ao e-mail do técnico (`tech_email`); check-in segue ao vivo
- Sem backend configurado = tudo como antes (offline, sem login)

### v7.4 — Tiles via CARTO (fim do 403) 🗺️
- OSM bloqueia apps direto no tile.openstreetmap.org; migramos p/ CARTO (permitido p/ apps, grátis)
- dark_all no tema escuro, light_all no tema claro (troca junto no toggle)
- Atribuição correta OSM + CARTO; service worker cacheia o novo host

### v7.3 — Backend grátis (Supabase) + ao vivo 🔴
- `backend/supabase-schema.sql`: tabelas routes + checkins (plano free, sem cartão)
- `supabase-sync.js`: compartilhar gera link curto (?r=CODIGO); check-in do técnico grava na nuvem
- Linha "AO VIVO" no painel da rota com botão de atualizar p/ o Hiago acompanhar
- Sem credencial em `backend-config.js` = cai sozinho p/ modo offline (#rota=)

### v7.2 — Rota por técnico (ponte Auvo) 📤
- Botão "Enviar p/ técnico (Auvo)" no painel do roteiro: gera texto + link com os dados da rota dentro (#rota=...)
- Técnico abre o link no celular e cai direto nas visitas do dia, mesmo sem base local
- Botão "Copiar retorno" no Modo Campo: resumo p/ colar de volta no Auvo/WhatsApp
- Sem backend: check-ins ficam no celular até o retorno ser colado



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
