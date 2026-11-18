# SiteNiver

Lista de presentes de aniversário de evento único: os convidados escolhem presentes ou cotas, podem
contribuir com qualquer valor e pagam via PIX. A aniversariante acompanha reservas, comprovantes e
confirma cada pagamento em um painel administrativo.

## Funcionalidades

- Lista pública com capa, foto e mensagem da aniversariante, busca, filtros por categoria e faixa de
    preço, ordenação e opção de ocultar presentes esgotados.
- Presentes com imagem opcional, várias categorias, link externo, preço cheio ou por cota e
    quantidade necessária.
- Contribuição livre (padrão: mínimo de R$ 5,00, sem máximo), com valores sugeridos e combinável com
    presentes.
- Carrinho persistido no navegador, checkout com nome e e-mail, PIX copia-e-cola + QR Code e reserva
    de estoque com prazo de expiração.
- Página do pedido com envio de mensagem, confirmação de pagamento e comprovante (imagem ou PDF).
- Painel com visão geral, CRUD de presentes e categorias, configurações da lista/PIX/contribuição e
    gestão de pedidos (confirmar, cancelar, anotações internas e comprovantes).
- Interface em português, sem biblioteca de i18n.

## Stack

- Angular 22 (standalone, signals, zoneless, SCSS puro — sem Tailwind)
- Hono em uma única função serverless da Vercel (`api/[...route].ts`)
- Upstash Redis para dados em produção; JSON local em `.data/` no desenvolvimento
- Vercel Blob para imagens (público) e comprovantes (privado)

## Estrutura

```
api/[...route].ts   entrada serverless que exporta o app Hono
server/             API: rotas, validação, store, auth, uploads, seed
shared/             tipos e geração de BR Code PIX usados pelo site e pela API
src/app/core/       clientes de API, stores (carrinho, pedidos, sessão), formatadores
src/app/features/   páginas públicas e do painel
src/app/shared/     componentes reutilizáveis (ícones, moeda, mídia, toast)
src/styles/         tokens, reset, layout e componentes globais
```

## Desenvolvimento local

Requisitos: Node 24 (`nvm use`) e npm.

```bash
npm install
cp .env.example .env.local   # ajuste a senha e o segredo
npm run api                  # API Hono em http://localhost:3000
npm start                    # Angular em http://localhost:4200 (proxy /api)
```

Sem Redis configurado, os dados ficam em `.data/store.json` e os uploads em `.data/uploads/`. Para
recomeçar do zero, pare a API e apague a pasta `.data`.

O painel fica em `http://localhost:4200/admin`. No ambiente local, use a senha definida em
`ADMIN_PASSWORD` ou o hash em `ADMIN_PASSWORD_HASH`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `ADMIN_PASSWORD` | uma das duas | Senha do painel (simples, para desenvolvimento). |
| `ADMIN_PASSWORD_HASH` | uma das duas | Hash scrypt no formato `scrypt:<salt>:<hash>`. Tem prioridade. |
| `AUTH_SECRET` | sim em produção | Segredo que assina o cookie de sessão (string longa e aleatória). |
| `APP_ORIGIN` | recomendada | Origem pública do site; usada na checagem de origem das mutações. |
| `UPSTASH_REDIS_REST_URL` | sim em produção | URL REST do Redis da Upstash. |
| `UPSTASH_REDIS_REST_TOKEN` | sim em produção | Token REST do Redis da Upstash. |
| `BLOB_READ_WRITE_TOKEN` | recomendada | Token do Vercel Blob para imagens públicas. |
| `BLOB_PRIVATE_READ_WRITE_TOKEN` | recomendada | Token do Vercel Blob para comprovantes privados. |
| `HOLD_HOURS` | não | Horas de reserva de estoque antes de expirar (padrão `24`). |
| `MAX_UPLOAD_MB` | não | Tamanho máximo de upload em MB (padrão `8`). |
| `DATA_DIR` | não | Pasta do store JSON local (padrão `.data`). |

Gere o hash da senha com:

```bash
npm run admin:hash -- "sua-senha-forte"
```

## Scripts

```bash
npm start             # Angular em modo desenvolvimento
npm run build         # build de produção em dist/site-niver/browser
npm run api           # API local (tsx)
npm run api:watch     # API local com reload
npm run typecheck:api # checagem de tipos do servidor
npm test              # testes unitários (Vitest)
npm run admin:hash    # gera ADMIN_PASSWORD_HASH
```

## Deploy na Vercel

1. Importe o repositório na Vercel (framework Angular; `vercel.json` já define build, saída e a
   rewrite da SPA).
2. Adicione um banco **Upstash Redis** pelo Marketplace e conecte ao projeto — as variáveis
   `UPSTASH_REDIS_REST_*` são criadas automaticamente.
3. Crie um **Blob store** e conecte ao projeto para obter `BLOB_READ_WRITE_TOKEN` e
   `BLOB_PRIVATE_READ_WRITE_TOKEN`.
4. Configure `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`, `APP_ORIGIN` (por exemplo
   `https://seu-projeto.vercel.app`) e, se quiser, `HOLD_HOURS` e `MAX_UPLOAD_MB`.
5. Faça o deploy. A primeira requisição cria a lista padrão e os dados iniciais no Redis.

Em produção a API exige Redis, `AUTH_SECRET` e uma senha de admin; sem isso o deploy responde com
erro de configuração.

## Como funciona

- **Estoque:** cada item é um produto com `neededQuantity` unidades/cotas. O checkout reserva a
    quantidade de forma atômica por `HOLD_HOURS`. Pedidos `pending` expiram sozinhos; ao confirmar,
    cancelar ou expirar, a reserva é liberada ou efetivada.
- **Status do pedido:** `pending` → `awaiting_confirmation` → `confirmed`, ou `cancelled` /
    `expired`. O comprador informa o pagamento; a confirmação é sempre manual no painel.
- **PIX:** é um BR Code estático com valor e `txid` curto derivado dos nomes dos presentes. Não há
    conciliação automática — confira o extrato antes de confirmar.
- **Contribuição:** entra como uma linha própria do pedido, com valor mínimo configurável e sem
    máximo; pode ser o único item do carrinho.
- **Comprovantes:** ficam em Blob privado e só são servidos pelo endpoint autenticado do painel.
- **Sessão do painel:** cookie HttpOnly assinado com `jose`, login com limite de tentativas em
    memória e checagem de origem nas mutações.

## Limites conhecidos

- Uma única lista por instância.
- Sem envio de e-mails; o comprador acompanha o pedido pelo link com token salvo no navegador.
- Proteção anti-bot é mínima (adequada a uma lista privada de festa).
