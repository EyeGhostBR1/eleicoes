// Metodologia da estimativa em linguagem simples (sem hooks).
import type { Turno } from "@/lib/types";
import { Card } from "../ui";

const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function ComoFunciona({
  margemHistorica,
  pctApurado,
  turno,
}: {
  margemHistorica: number | null | undefined;
  /** % apurado atual (null antes da apuração) */
  pctApurado: number | null | undefined;
  turno: Turno;
}) {
  return (
    <Card as="section" className="p-4 sm:p-5" aria-labelledby="como-funciona">
      <h2 id="como-funciona" className="text-lg font-semibold tracking-tight text-strong">
        Como funciona a estimativa
      </h2>
      <p className="mt-1 text-sm font-medium text-strong">Metodologia particular, Gabriel González - @gabrielfgonz</p>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 text-[15px] leading-relaxed md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-semibold text-strong">Por que não basta olhar o parcial?</h3>
          <p>
            As urnas não chegam em ordem aleatória. Estados do Sul, Sudeste e Centro-Oeste costumam totalizar mais rápido
            que os do Norte e Nordeste. Em 2022, Jair Bolsonaro liderou boa parte da apuração e Lula só passou à frente
            depois que mais da metade das urnas já estava apurada, quando chegaram os votos do Nordeste. O parcial,
            sozinho, engana.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-strong">O que o modelo faz</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Em cada estado, compara o resultado de 2026 nas seções já apuradas com o resultado de{" "}
              <strong>2022 nos mesmos municípios</strong>, na mesma proporção já apurada de cada um. A diferença é o{" "}
              <em>swing</em> — já descontado o efeito de quais cidades chegaram primeiro.
            </li>
            <li>Aplica esse swing ao resultado de 2022 das seções que ainda faltam no estado.</li>
            <li>
              Estado ainda sem votos apurados usa o swing médio da sua região (ou do país). O total do Brasil é a soma de
              todos os estados e do exterior.
            </li>
          </ol>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-strong">Três cenários e a faixa</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Base 2022</strong> (principal): o cálculo acima.
            </li>
            <li>
              <strong>Base 2018</strong>: o mesmo cálculo com 2018 (Haddad × Jair) como referência.
            </li>
            <li>
              <strong>Proporcional</strong>: o que falta em cada estado vota igual ao que já foi apurado nele.
            </li>
          </ul>
          <p>
            A <strong>faixa provável</strong> vai do menor ao maior valor entre os cenários base 2022 e proporcional,
            alargada pela margem de erro histórica (o cenário base 2018 é mostrado, mas não entra na faixa).{" "}
            {margemHistorica != null && pctApurado != null ? (
              <>
                Em simulações refazendo a apuração de 2022 e 2018 com este método, o erro típico com{" "}
                {Math.round(pctApurado)}% apurado foi de até{" "}
                <strong>{nf1.format(margemHistorica)} p.p.</strong>
              </>
            ) : (
              <>
                Essa margem vem de simulações refazendo a apuração de 2022 e 2018 com este método: é maior no começo da
                noite e diminui conforme mais seções são apuradas.
              </>
            )}
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-strong">Limitações</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supõe que a mudança em relação a 2022 é parecida em todo o estado — cidades que faltam podem ter mudado diferente.</li>
            <li>No começo da apuração há poucas seções e a estimativa oscila bastante.</li>
            <li>
              O candidato da direita em 2026 (Flávio Bolsonaro) não é o mesmo de 2018 e 2022 (Jair Bolsonaro); o swing mede
              só a diferença média em cada estado.
            </li>
            {turno === 1 && (
              <li>
                No 1º turno, &ldquo;Outros&rdquo; reúne todos os demais candidatos; a estimativa não separa cada um deles.
              </li>
            )}
            <li>
              É uma estimativa estatística independente, não uma pesquisa nem um resultado oficial. O resultado oficial é o
              do TSE.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
