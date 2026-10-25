import type { Metadata } from "next";
import Link from "next/link";
import { BLOCOS, TSE_APP_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Sobre e metodologia",
  description: "Como a Apuração 2026 compara Lula e Flávio Bolsonaro com 2022 e 2018.",
};

export default function SobrePage() {
  return (
    <article className="mx-auto max-w-3xl space-y-5 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Sobre e metodologia</h1>
      <p className="font-medium text-strong">Metodologia particular, Gabriel González - @gabrielfgonz</p>
      <p>
        Este site acompanha a apuração da eleição presidencial de 2026 a partir dos arquivos públicos de divulgação do{" "}
        <a href={TSE_APP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          TSE
        </a>{" "}
        e compara, no Brasil, em cada estado e em cada município, o desempenho dos dois principais campos políticos com as
        eleições de 2022 e 2018.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-strong">Blocos comparados</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-semibold" style={{ color: "var(--c-pt)" }}>
              {BLOCOS.pt.rotulo}
            </span>
            : Lula (2026 e 2022) ≙ Fernando Haddad (2018).
          </li>
          <li>
            <span className="font-semibold" style={{ color: "var(--c-bolso)" }}>
              {BLOCOS.bolso.rotulo}
            </span>
            : Flávio Bolsonaro (2026) ≙ Jair Bolsonaro (2022 e 2018).
          </li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-strong">Como ler os números</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Percentuais calculados sobre os votos válidos (excluídos brancos e nulos), como faz o TSE.</li>
          <li>1º turno é comparado com 1º turno; 2º turno com 2º turno.</li>
          <li>
            Δ (variação) é a diferença em pontos percentuais (p.p.) entre 2026 e o ano de referência. Ex.: Lula com 50% em
            2026 e 48% em 2022 → +2,0 p.p.
          </li>
          <li>
            Durante a apuração, 2026 é parcial (apenas as seções já totalizadas), enquanto 2022 e 2018 são resultados
            finais. A ordem de chegada das urnas varia por região, então comparações no início da apuração podem mudar
            bastante.
          </li>
          <li>
            Comparecimento e abstenção são calculados sobre o eleitorado; brancos e nulos, sobre o comparecimento.
          </li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-strong">Votos no exterior (boletins de urna)</h2>
        <p>
          As seções no exterior encerram a votação no horário local, horas antes das 17h de Brasília. O TSE publica o{" "}
          <em>boletim de urna</em> de cada seção assim que ele é recebido, antes da totalização. A página{" "}
          <Link href="/exterior" className="underline underline-offset-2">
            Exterior por país
          </Link>{" "}
          lê esses boletins, soma os votos por cidade e por país e os compara com 2022 e 2018.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            O total parcial do exterior é enviesado pela geografia: chegam primeiro Ásia e Oceania, depois Oriente Médio,
            Europa e África e, por último, as Américas.
          </li>
          <li>
            Por isso, a comparação principal soma 2022 e 2018 apenas nas <strong>mesmas cidades</strong> que já têm
            boletins em 2026 — só as cidades com todas as seções recebidas, ou todas as que têm ao menos uma seção.
          </li>
          <li>
            Enquanto o TSE não totaliza o exterior, a linha “Exterior” da tabela de estados usa esses boletins (selo “BU”).
          </li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-strong">Fontes</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Resultados 2026: arquivos de divulgação do TSE (atualizados automaticamente a cada 30 segundos).
          </li>
          <li>
            Exterior antes da totalização: boletins de urna publicados pelo TSE para cada seção (atualizados a cada minuto).
          </li>
          <li>
            2022 e 2018: Portal de Dados Abertos do TSE (
            <a href="https://dadosabertos.tse.jus.br/dataset/resultados-2022" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              2022
            </a>
            ,{" "}
            <a href="https://dadosabertos.tse.jus.br/dataset/resultados-2018" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              2018
            </a>
            ).
          </li>
        </ul>
      </section>
      <p>
        <Link href="/" className="font-medium text-strong underline underline-offset-2">
          Voltar ao painel
        </Link>
      </p>
    </article>
  );
}
