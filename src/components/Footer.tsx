// Rodapé estático (server component): fontes e notas de metodologia.
import Link from "next/link";
import { TSE_APP_URL } from "@/lib/config";

const DADOS_ABERTOS = [
  { ano: "2022", url: "https://dadosabertos.tse.jus.br/dataset/resultados-2022" },
  { ano: "2018", url: "https://dadosabertos.tse.jus.br/dataset/resultados-2018" },
];

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-3 py-6 text-sm text-muted sm:px-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <p>
            Lula ≙ Haddad (2018); Flávio ≙ Jair (2022/2018). Percentuais sobre votos válidos. Compara-se 1º turno com 1º
            turno e 2º turno com 2º turno. Durante a apuração, os números de 2026 são parciais; 2022 e 2018 são
            resultados finais.
          </p>
          <p>
            Site independente, sem vínculo com o TSE.{" "}
            <Link href="/sobre" className="underline underline-offset-2 hover:text-fg">
              Sobre e metodologia
            </Link>
          </p>
          <p className="font-medium text-fg">Metodologia particular, Gabriel González - @gabrielfgonz</p>
        </div>
        <div>
          <p className="font-medium text-fg">Fontes</p>
          <ul className="mt-1 space-y-1">
            <li>
              <a href={TSE_APP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">
                TSE — Resultados (divulgação oficial)
              </a>
            </li>
            {DADOS_ABERTOS.map((d) => (
              <li key={d.ano}>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">
                  TSE — Dados abertos {d.ano}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
