// Comparação 1º × 2º turno no EXTERIOR a partir dos boletins de urna (BU) dos dois turnos.
//
// O exterior não depende da totalização do TSE: os boletins chegam antes (e por fuso horário).
// Para não comparar geografias diferentes, o 1º turno é somado só nas MESMAS cidades que já
// têm boletim no 2º turno (no total e em cada país).
import { linhaTurnos, valTurnoDeExt, type LinhaTurnos } from "@/lib/turnos";
import type { ExtCidade, ExteriorResponse } from "@/lib/types";
import { somaAgregados } from "../exterior/dados";

export interface TurnosExterior {
  total: LinhaTurnos | null;
  paises: LinhaTurnos[];
  cidades: LinhaTurnos[];
}

const recebida = (c: ExtCidade | undefined): c is ExtCidade => !!c && c.secoesRecebidas > 0 && c.validos > 0;

export function turnosExterior(
  ext1: ExteriorResponse | undefined,
  ext2: ExteriorResponse | undefined,
  qs: string,
): TurnosExterior {
  if (!ext1) return { total: null, paises: [], cidades: [] };
  // cidades com boletim nos dois turnos
  const pares: [ExtCidade, ExtCidade][] = [];
  for (const [cd, c2] of Object.entries(ext2?.cidades ?? {})) {
    const c1 = ext1.cidades[cd];
    if (recebida(c2) && recebida(c1)) pares.push([c1, c2]);
  }

  // tabela: todas as cidades com votos no 1º turno; 2º turno só onde já há boletim
  const cidades = Object.values(ext1.cidades)
    .filter(recebida)
    .map((c1) => {
      const c2 = ext2?.cidades?.[c1.cd];
      return linhaTurnos(
        { id: c1.cd, nome: c1.nome, sub: c1.pais, href: `/cidade/zz/${c1.cd}${qs}` },
        valTurnoDeExt(c1),
        recebida(c2) ? valTurnoDeExt(c2) : null,
      );
    });

  // países: com boletins no 2º turno, o 1º turno é somado só nessas mesmas cidades
  const porPais = new Map<string, { todas: ExtCidade[]; p1: ExtCidade[]; p2: ExtCidade[] }>();
  for (const c1 of Object.values(ext1.cidades)) {
    if (!recebida(c1)) continue;
    let g = porPais.get(c1.pais);
    if (!g) porPais.set(c1.pais, (g = { todas: [], p1: [], p2: [] }));
    g.todas.push(c1);
    const c2 = ext2?.cidades?.[c1.cd];
    if (recebida(c2)) {
      g.p1.push(c1);
      g.p2.push(c2);
    }
  }
  const paises = [...porPais].map(([pais, g]) =>
    g.p2.length
      ? linhaTurnos({ id: pais, nome: pais }, valTurnoDeExt(somaAgregados(g.p1)), valTurnoDeExt(somaAgregados(g.p2)))
      : linhaTurnos({ id: pais, nome: pais }, valTurnoDeExt(somaAgregados(g.todas)), null),
  );

  // sem boletim do 2º turno ainda: mostra o 1º turno do exterior inteiro
  const total = pares.length
    ? linhaTurnos(
        { id: "zz", nome: "Exterior" },
        valTurnoDeExt(somaAgregados(pares.map((p) => p[0]))),
        valTurnoDeExt(somaAgregados(pares.map((p) => p[1]))),
      )
    : linhaTurnos({ id: "zz", nome: "Exterior" }, valTurnoDeExt(ext1.total), null);

  return { total, paises, cidades };
}
