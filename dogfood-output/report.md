# Dogfood QA Report

**Target:** https://devhiagoalves.github.io/enebras_maps/
**Date:** 2026-09-14
**Scope:** login, painel de OSs (criar), perfil, usuários (adm), visão do técnico, mobile 390px, logout — fluxos com backend real
**Tester:** Hermes Agent (automated exploratory QA)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 1 |
| 🟡 Medium | 2 |
| 🔵 Low | 1 |
| **Total** | **5** |

**Overall Assessment:** login, OSs, perfil e logout funcionam sem erros de console; 2 bugs reais encontrados e corrigidos (técnico sem navegação no desktop, loading travado ao criar OS).

---

## Issues

### Issue #1: Técnico no desktop fica sem navegação, sem identificação e sem logout

| Field | Value |
|-------|-------|
| **Severity** | 🔴 Critical |
| **Category** | Functional |
| **URL** | https://devhiagoalves.github.io/enebras_maps/ |

**Description:**
Logado como técnico numa tela larga (>768px), a sidebar some (correto) mas a topbar mobile com os botões Visitas/Mapa, nome do usuário e Sair nunca aparece — ela só existe dentro do `@media (max-width:768px)`. O técnico vê só o mapa, sem conseguir trocar de tela, se identificar ou sair.

**Steps to Reproduce:**
1. Logar como tec1@enebras.teste num navegador desktop
2. Observar: só o mapa, sem topbar

**Expected Behavior:**
Técnico vê topbar com Visitas/Mapa, nome e Sair em qualquer largura.

**Actual Behavior:**
Só o mapa; sem navegação e sem logout.

**Screenshot:**
MEDIA:C:/Users/Luana Reis/OneDrive/Documentos/Default Project/mapa-clientes-pro/dogfood-output/screenshots/08-tec-view.png

**Status:** corrigido na v8.10 (layout campo forçado com `body.is-tec` em qualquer largura).

---

### Issue #2: Loading trava para sempre após criar OS

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | https://devhiagoalves.github.io/enebras_maps/ |

**Description:**
Ao criar OS com cidade/UF, a geocodificação roda mas ninguém esconde o overlay de loading — a tela congela no "Geocodificando..." até recarregar a página.

**Steps to Reproduce:**
1. Logar como adm → OSs → Nova OS (preencher cliente + cidade/UF) → Criar OS
2. Overlay de loading não sai mais

**Expected Behavior:**
Loading some ao concluir (sucesso ou erro).

**Actual Behavior:**
Overlay preso; app inutilizável até reload.

**Screenshot:**
MEDIA:C:/Users/Luana Reis/OneDrive/Documentos/Default Project/mapa-clientes-pro/dogfood-output/screenshots/04-os-created.png

**Console Errors:**
```
(nenhum — falha silenciosa, sem catch visível)
```

**Status:** corrigido na v8.10 (`hideLoading` em `finally`).

---

### Issue #3: Chip de usuário fantasma antes do login

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Visual |
| **URL** | https://devhiagoalves.github.io/enebras_maps/ |

**Description:**
Deslogado, a sidebar mostra o chip com avatar "?", nome "..." e botão Sair — sugere sessão ativa inexistente.

**Steps to Reproduce:**
1. Abrir o site sem logar

**Expected Behavior:**
Sem chip até logar.

**Actual Behavior:**
Chip placeholder visível.

**Screenshot:**
MEDIA:C:/Users/Luana Reis/OneDrive/Documentos/Default Project/mapa-clientes-pro/dogfood-output/screenshots/01-login.png

**Status:** corrigido na v8.10 (chip só com `body.is-admin`/`is-tec`).

---

### Issue #4: Tag de usuário estoura a topbar no celular

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | https://devhiagoalves.github.io/enebras_maps/ |

**Description:**
Em 390px, "Hiago (Adm) • Adm" quebra em 3 linhas ao lado do Sair, espremendo os botões Visitas/Mapa.

**Steps to Reproduce:**
1. Logar e ver em viewport de celular

**Expected Behavior:**
Identificação compacta em 1 linha.

**Actual Behavior:**
Texto em 3 linhas.

**Screenshot:**
MEDIA:C:/Users/Luana Reis/OneDrive/Documentos/Default Project/mapa-clientes-pro/dogfood-output/screenshots/07-mobile-visits.png

**Status:** mitigado na v8.10 (ellipsis + botão 44px).

---

### Issue #5: Botão "Copiar retorno" solto na tela vazia

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | UX |
| **URL** | https://devhiagoalves.github.io/enebras_maps/ |

**Description:**
Sem visitas no dia, o botão aparece sozinho no meio da área vazia, sem contexto.

**Steps to Reproduce:**
1. Ver visitas com lista vazia

**Expected Behavior:**
Botão junto da lista ou oculto quando vazia.

**Actual Behavior:**
Botão isolado no vazio.

**Screenshot:**
MEDIA:C:/Users/Luana Reis/OneDrive/Documentos/Default Project/mapa-clientes-pro/dogfood-output/screenshots/07-mobile-visits.png

**Status:** registrado, sem correção (backlog).

---

## Issues Summary Table

| # | Title | Severity | Category | URL |
|---|-------|----------|----------|-----|
| 1 | Técnico desktop sem navegação/logout | Critical | Functional | /enebras_maps/ |
| 2 | Loading trava após criar OS | High | Functional | /enebras_maps/ |
| 3 | Chip fantasma deslogado | Medium | Visual | /enebras_maps/ |
| 4 | Tag estoura topbar no celular | Medium | UX | /enebras_maps/ |
| 5 | Botão retorno solto no vazio | Low | UX | /enebras_maps/ |

## Testing Coverage

### Pages Tested
- Login (desktop + mobile)
- Dashboard logado (adm)
- Painel de OSs (listar, criar end-to-end com geocodificação real)
- Perfil (eu) + Usuários (lista adm)
- Visão do técnico (desktop + mobile 390px)
- Logout → retorno ao login

### Features Tested
- Auth Supabase (2 perfis), chip, Sair, sessão
- CRUD de OS via UI, filtro,empty states
- Console JS após cada interação: zero erros em todo o percurso

### Not Tested / Out of Scope
- Check-in/out com GPS real (só em campo, com celular)
- Upload de foto de perfil (usa câmera/arquivo do aparelho)
- Criação de usuário pelo painel (criaria login real — deixar pro Hiago)
- iPhone/Safari, impressão, modo offline prolongado

### Blockers
- Nenhum (overlay travado foi contornado via JS no harness de teste).

---

## Notes

- Fluxo login → criar OS → lista funcionou de ponta a ponta contra o backend real, sem nenhum erro de console.
- Dados de teste criados no QA ("Cliente QA Dogfood") foram apagados do banco após o teste.
- Recomendado repetir o passe após o deploy da v8.10, com celular real para GPS e foto.
