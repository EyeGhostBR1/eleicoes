# Apuração 2026 — Lula × Flávio vs 2022 e 2018

Site em produção: https://apuracao-2026-three.vercel.app

Acompanha a apuração presidencial de 2026 em tempo real (TSE) e compara, por país, estado e município,
com os resultados finais de 2022 e 2018. Base de comparação: **Lula ≙ Lula (2022) ≙ Haddad (2018)** e
**Flávio Bolsonaro ≙ Jair Bolsonaro (2022 e 2018)**. Percentuais sobre votos válidos; 1º turno compara com
1º turno, 2º com 2º.

## Páginas
- `/` — Brasil: totalização, comparação dos blocos, participação, mapa e tabela por estado
- `/estado/[uf]` — estado + mapa e tabela de todos os municípios (`zz` = exterior)
- `/cidade/[uf]/[cd]` — município (código TSE de 5 dígitos)
- `/boletins` — boletins da imprensa (g1, CNN, Terra, Jovem Pan, UOL, Folha, Estadão, Band, R7, Poder360,
  Metrópoles + painel de apuração do g1), números extraídos e comparados; comparador manual
- `?turno=2` alterna o turno; `?amb=simulado` usa o ambiente de simulação do TSE (dados fictícios)

## Dados
- Ao vivo: `resultados.tse.jus.br` (eleições 6257/6258), lido no servidor por `/api/tse/*`
  (o TSE bloqueia chamadas do navegador de outros domínios). Funções na região `gru1` (São Paulo).
- 2018/2022: dados abertos do TSE, pré-processados em `public/data/hist/` por
  `python scripts/hist/build_hist.py`.
- Mapas: malhas do IBGE simplificadas em `public/geo/` por `node scripts/geo/build_geo.mjs`.

## Desenvolvimento
```bash
npm install
npm run dev
npx tsx scripts/dev/test-tse.ts     # testes do módulo TSE
npx tsx scripts/dev/test-news.ts    # testes do parser de boletins
vercel deploy --prod                # deploy
```
