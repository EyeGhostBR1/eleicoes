// Margem histórica do modelo de estimativa (p.p. dos votos válidos), por faixa de % de seções
// apuradas no país. Usada para alargar o intervalo nacional ([mín, máx] dos cenários ± margem).
//
// Como foi gerada (scripts/dev/backtest-estimativa.ts, 6 sementes por ordem, 2026-10-04):
//  - 2022 tratado como eleição "ao vivo" e 2018 como ano-base (1º e 2º turnos), e o inverso
//    (2018 "ao vivo", base 2022) como verificação;
//  - apurações parciais simuladas por município com 5 ordens de chegada: por região
//    (S/SE/CO rápidos, N/NE lentos, exterior por último), municípios pequenos primeiro,
//    capitais/grandes primeiro, aleatória e progresso intramunicipal gradual; níveis de
//    1%, 3%, …, 99% das seções do país (seções ≈ eleitorado apto);
//  - erro = cenário base-ano do modelo − resultado final verdadeiro (nacional);
//  - por faixa: maior entre o p95 do |erro| do bloco PT e o do bloco Bolsonaro (1º e 2º turnos
//    juntos), o maior entre as duas direções, envelope não crescente com o % apurado,
//    arredondado para cima a 0,1 p.p. (piso 0,2).
// Observação: o backtest 2018↔2022 troca o candidato do PT (Haddad ↔ Lula), um swing grande e
// heterogêneo; para 2026 × 2022 (Lula × Lula) a margem tende a ser conservadora. Por outro lado o
// backtest supõe que as seções apuradas de um município se comportam como a média do município.
// O modelo (modelo.ts, regra 9) ainda limita a margem ao teto matemático 100·R'/(V+R') p.p.
// (R' = 1,5 × válidos restantes): perto do fim ela cai abaixo da tabela e a 100% vale 0.

export const MARGENS: { ate: number; pp: number }[] = [
  { ate: 10, pp: 5.0 },
  { ate: 20, pp: 4.8 },
  { ate: 30, pp: 4.4 },
  { ate: 40, pp: 3.6 },
  { ate: 50, pp: 2.8 },
  { ate: 60, pp: 2.1 },
  { ate: 70, pp: 1.6 },
  { ate: 80, pp: 1.3 },
  { ate: 90, pp: 0.9 },
  { ate: 100, pp: 0.4 },
];

/**
 * Margem (p.p.) para o % de seções apuradas no país (0–100). Faixa [ate−10, ate); 100% usa a
 * última faixa. null para valor inválido.
 */
export function margemPara(pctApurado: number): number | null {
  if (!isFinite(pctApurado) || pctApurado < 0) return null;
  for (const m of MARGENS) if (pctApurado < m.ate) return m.pp;
  return MARGENS[MARGENS.length - 1]?.pp ?? null;
}
