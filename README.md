# Enebras - Mapa de Clientes

Mapa interativo do Brasil para visualização de clientes com importação de planilhas CSV/Excel.

## Funcionalidades

- Mapa interativo com ruas, avenidas e regiões (OpenStreetMap)
- Contorno e nome de todos os 27 estados brasileiros
- Importação de planilhas CSV e Excel (.xlsx, .xls)
- Importação incremental (só adiciona clientes novos)
- Geocodificação automática de endereços
- Persistência de dados local (IndexedDB)
- Busca e filtros por estado/cidade
- Marcadores de clientes com popup de detalhes
- Responsivo (desktop e mobile)
- Funciona offline (PWA)

## Como usar

1. Abra `index.html` no navegador
2. Clique em "Importar CSV/Excel" para carregar sua planilha
3. Ou clique em "Exemplo" para carregar dados de demonstração

### Formato da planilha

A planilha deve ter pelo menos a coluna `nome`. Colunas opcionais:

| Coluna | Variações aceitas |
|--------|------------------|
| Nome | nome, name, cliente, empresa, razao_social |
| Endereço | endereco, address, rua, logradouro |
| Cidade | cidade, city, municipio |
| Estado | estado, state, uf |
| CEP | cep, postal, zip |
| Telefone | telefone, phone, tel, celular |
| Email | email, e-mail |
| Latitude | lat, latitude |
| Longitude | lng, lon, longitude |

Se não tiver latitude/longitude, o sistema geocodifica automaticamente pelo cidade+estado.

## Hospedagem

O projeto é 100% frontend. Pode ser hospedado em:

- **GitHub Pages** - Gratuito, simples
- **Netlify** - Gratuito, deploy automático
- **Vercel** - Gratuito, rápido
- **Firebase Hosting** - Gratuito, Google

### Deploy no GitHub Pages

1. Crie um repositório no GitHub
2. Suba os arquivos
3. Vá em Settings > Pages
4. Selecione a branch `main`
5. Acesse `https://seu-usuario.github.io/nome-do-repositorio`

### Deploy no Netlify

1. Acesse [netlify.com](https://netlify.com)
2. Arraste a pasta do projeto
3. Pronto! Ganha uma URL automática

## Estrutura do projeto

```
mapa-clientes/
├── index.html          # Página principal
├── style.css           # Estilos
├── app.js              # Lógica principal
├── db.js               # Banco de dados local (IndexedDB)
├── manifest.json       # Configuração PWA
├── sw.js               # Service Worker (offline)
├── favicon.svg         # Ícone do site
├── .gitignore          # Arquivos ignorados pelo Git
└── README.md           # Este arquivo
```

## Tecnologias

- **Leaflet** - Mapas interativos
- **OpenStreetMap** - Tiles do mapa
- **SheetJS** - Leitura de planilhas Excel
- **IndexedDB** - Armazenamento local
- **Nominatim** - Geocodificação

## Licença

MIT
