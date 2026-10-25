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

  const cidades = pares.map(([c1, c2]) =>
    linhaTurnos(
      { id: c2.cd, nome: c2.nome, sub: c2.pais, href: `/cidade/zz/${c2.cd}${qs}` },
      valTurnoDeExt(c1),
      valTurnoDeExt(c2),
    ),
  );

  const porPais = new Map<string, [ExtCidade[], ExtCidade[]]>();
  for (const [c1, c2] of pares) {
    let p = porPais.get(c2.pais);
    if (!p) porPais.set(c2.pais, (p = [[], []]));
    p[0].push(c1);
    p[1].push(c2);
  }
  const paises = [...porPais].map(([pais, [l1, l2]]) =>
    linhaTurnos({ id: pais, nome: pais }, valTurnoDeExt(somaAgregados(l1)), valTurnoDeExt(somaAgregados(l2))),
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
