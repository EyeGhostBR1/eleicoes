// Cidade do exterior (código TSE, UF "zz") → país (nome pt-BR + ISO 3166-1 alfa-2).
//
// Cobre as 186 cidades do exterior de 2026 (oficial-mun-e006257-cm.json) e os códigos
// históricos que existiram só em 2018/2022 (public/data/hist/mun/zz.json): 99252 Vaticano,
// 99406 Freetown e 99422 Lethem. Verificação: `npx tsx scripts/dev/check-paises.ts`.
//
// Convenções:
// - Nomes de país na forma curta usada pela imprensa brasileira ("Estados Unidos",
//   "Reino Unido", "Países Baixos", "República Tcheca", "Coreia do Sul"...).
// - Hong Kong, Cantão (Guangzhou), Xangai e Pequim → "China" (CN). Hong Kong e Macau são
//   regiões administrativas especiais da China; o Itamaraty/TSE tratam o posto de Hong Kong
//   como consulado na China, e agregar por país soma tudo em "China". (Macau não tem seção.)
// - Taipé → "Taiwan" (TW), contabilizado à parte, como faz o próprio TSE (cidade própria).
// - Caiena e St. Georges de l'Oyapock → "Guiana Francesa" (GF). Juridicamente é território
//   ultramarino da França, mas para o eleitor brasileiro (fronteira com o Amapá) é um
//   eleitorado distinto do da França europeia; ISO 3166-1 atribui código próprio (GF).
// - Ramallah → "Palestina" (PS). Vaticano → "Vaticano" (VA).
// - Homônimos resolvidos pelo posto consular brasileiro existente: SAINT JOHNS = Saint John's,
//   Antígua e Barbuda (embaixada; não há posto em St. John's, Canadá); CONCEPCIÓN = Paraguai
//   (vice-consulado; voto majoritariamente "brasiguaio"); CÓRDOBA e MENDOZA = Argentina;
//   RIO BRANCO, CHUY, ARTIGAS e RIVERA = Uruguai; LAGOS = Nigéria; TRÍPOLI = Líbia;
//   SÃO JOSÉ = Costa Rica; SANTIAGO = Chile; PORTO = Portugal; PRAIA = Cabo Verde.

/** ISO 3166-1 alfa-2 → nome do país em pt-BR. */
export const PAIS_NOME_POR_ISO2 = {
  AE: "Emirados Árabes Unidos",
  AG: "Antígua e Barbuda",
  AL: "Albânia",
  AM: "Armênia",
  AO: "Angola",
  AR: "Argentina",
  AT: "Áustria",
  AU: "Austrália",
  AZ: "Azerbaijão",
  BA: "Bósnia e Herzegovina",
  BB: "Barbados",
  BD: "Bangladesh",
  BE: "Bélgica",
  BF: "Burkina Faso",
  BG: "Bulgária",
  BH: "Bahrein",
  BJ: "Benin",
  BO: "Bolívia",
  BS: "Bahamas",
  BW: "Botsuana",
  BZ: "Belize",
  CA: "Canadá",
  CD: "República Democrática do Congo",
  CG: "República do Congo",
  CH: "Suíça",
  CI: "Costa do Marfim",
  CL: "Chile",
  CM: "Camarões",
  CN: "China",
  CO: "Colômbia",
  CR: "Costa Rica",
  CU: "Cuba",
  CV: "Cabo Verde",
  CY: "Chipre",
  CZ: "República Tcheca",
  DE: "Alemanha",
  DK: "Dinamarca",
  DO: "República Dominicana",
  DZ: "Argélia",
  EC: "Equador",
  EE: "Estônia",
  EG: "Egito",
  ES: "Espanha",
  ET: "Etiópia",
  FI: "Finlândia",
  FR: "França",
  GA: "Gabão",
  GB: "Reino Unido",
  GE: "Geórgia",
  GF: "Guiana Francesa",
  GH: "Gana",
  GN: "Guiné",
  GQ: "Guiné Equatorial",
  GR: "Grécia",
  GT: "Guatemala",
  GW: "Guiné-Bissau",
  GY: "Guiana",
  HN: "Honduras",
  HR: "Croácia",
  HT: "Haiti",
  HU: "Hungria",
  ID: "Indonésia",
  IE: "Irlanda",
  IL: "Israel",
  IN: "Índia",
  IQ: "Iraque",
  IR: "Irã",
  IT: "Itália",
  JM: "Jamaica",
  JO: "Jordânia",
  JP: "Japão",
  KE: "Quênia",
  KP: "Coreia do Norte",
  KR: "Coreia do Sul",
  KW: "Kuwait",
  KZ: "Cazaquistão",
  LB: "Líbano",
  LC: "Santa Lúcia",
  LK: "Sri Lanka",
  LY: "Líbia",
  MA: "Marrocos",
  ML: "Mali",
  MM: "Mianmar",
  MW: "Malawi",
  MX: "México",
  MY: "Malásia",
  MZ: "Moçambique",
  NA: "Namíbia",
  NG: "Nigéria",
  NI: "Nicarágua",
  NL: "Países Baixos",
  NO: "Noruega",
  NP: "Nepal",
  NZ: "Nova Zelândia",
  OM: "Omã",
  PA: "Panamá",
  PE: "Peru",
  PH: "Filipinas",
  PK: "Paquistão",
  PL: "Polônia",
  PS: "Palestina",
  PT: "Portugal",
  PY: "Paraguai",
  QA: "Catar",
  RO: "Romênia",
  RS: "Sérvia",
  RU: "Rússia",
  SA: "Arábia Saudita",
  SE: "Suécia",
  SG: "Singapura",
  SI: "Eslovênia",
  SK: "Eslováquia",
  SL: "Serra Leoa",
  SN: "Senegal",
  SR: "Suriname",
  ST: "São Tomé e Príncipe",
  SV: "El Salvador",
  SY: "Síria",
  TG: "Togo",
  TH: "Tailândia",
  TL: "Timor-Leste",
  TN: "Tunísia",
  TR: "Turquia",
  TT: "Trinidad e Tobago",
  TW: "Taiwan",
  TZ: "Tanzânia",
  UA: "Ucrânia",
  US: "Estados Unidos",
  UY: "Uruguai",
  VA: "Vaticano",
  VE: "Venezuela",
  VN: "Vietnã",
  ZA: "África do Sul",
  ZM: "Zâmbia",
  ZW: "Zimbábue",
} as const;

export type Iso2Exterior = keyof typeof PAIS_NOME_POR_ISO2;

/** código TSE da cidade → ISO2 do país. Comentário = nome TSE da cidade. */
const CIDADE_ISO2: Record<string, Iso2Exterior> = {
  "29254": "CI", // ABIDJÃ
  "29262": "AE", // ABU DHABI
  "99198": "NG", // ABUJA
  "29270": "GH", // ACCRA
  "99325": "ET", // ADIS ABEBA
  "30457": "NL", // AMSTERDÃ (ROTTERDÃ em 2018)
  "29289": "JO", // AMÃ
  "29297": "TR", // ANCARA
  "29300": "DZ", // ARGEL
  "29319": "UY", // ARTIGAS
  "29327": "PY", // ASSUNÇÃO
  "39241": "KZ", // ASTANA
  "29335": "GR", // ATENAS
  "39080": "US", // ATLANTA
  "99171": "IQ", // BAGDÁ
  "39128": "AZ", // BAKU
  "99350": "ML", // BAMAKO
  "29343": "TH", // BANGKOK
  "29351": "ES", // BARCELONA
  "99473": "BH", // BAREIN
  "29360": "LB", // BEIRUTE
  "29378": "RS", // BELGRADO
  "38881": "BZ", // BELMOPAN
  "29386": "DE", // BERLIM
  "29394": "GW", // BISSAU
  "29408": "CO", // BOGOTÁ
  "29416": "US", // BOSTON
  "39209": "SK", // BRATISLAVA
  "39187": "CG", // BRAZZAVILLE
  "29424": "BB", // BRIDGETOWN
  "29432": "BE", // BRUXELAS
  "29440": "RO", // BUCARESTE
  "29459": "HU", // BUDAPESTE
  "29467": "AR", // BUENOS AIRES
  "29475": "GF", // CAIENA
  "29483": "EG", // CAIRO
  "29491": "AU", // CAMBERRA
  "30651": "CN", // CANTÃO
  "29505": "VE", // CARACAS
  "99384": "LC", // CASTRIES
  "29513": "US", // CHICAGO
  "29521": "UY", // CHUY
  "29530": "ZA", // CIDADE DO CABO
  "29556": "PY", // CIUDAD DEL ESTE
  "29564": "VE", // CIUDAD GUAYANA
  "99210": "BO", // COBIJA
  "29572": "BO", // COCHABAMBA
  "30929": "LK", // COLOMBO
  "38903": "GN", // CONACRI
  "29580": "PY", // CONCEPCIÓN
  "29599": "DK", // COPENHAGUE
  "38920": "BJ", // COTONOU
  "29602": "AR", // CÓRDOBA
  "29610": "SN", // DACAR
  "29629": "BD", // DACCA
  "29637": "SY", // DAMASCO
  "38962": "TZ", // DAR ES SALAAM
  "29653": "QA", // DOHA
  "29661": "IE", // DUBLIN
  "29645": "TL", // DÍLI
  "99503": "GB", // EDIMBURGO
  "29670": "PY", // ENCARNACIÓN
  "29688": "SE", // ESTOCOLMO
  "30961": "PT", // FARO
  "29696": "DE", // FRANKFURT
  "99406": "SL", // FREETOWN (só 2018)
  "30669": "BW", // GABORONE
  "29700": "CH", // GENEBRA
  "29718": "GY", // GEORGETOWN
  "98000": "GT", // GUATEMALA
  "29742": "JP", // HAMAMATSU
  "29750": "VN", // HANÓI
  "29769": "ZW", // HARARE
  "30902": "US", // HARTFORD
  "29777": "CU", // HAVANA
  "29785": "FI", // HELSINQUE
  "29793": "CN", // HONG KONG
  "29807": "US", // HOUSTON
  "29815": "CM", // IAUNDÊ
  "38989": "AM", // IEREVAN
  "29823": "PE", // IQUITOS
  "29831": "PK", // ISLAMABADE
  "39306": "TR", // ISTAMBUL
  "29840": "ID", // JACARTA
  "29173": "NP", // KATMANDU
  "29858": "UA", // KIEV
  "99430": "JM", // KINGSTON-JAMAICA
  "29874": "CD", // KINSHASA
  "29882": "KW", // KUAITE
  "29890": "MY", // KUALA LUMPUR
  "29904": "BO", // LA PAZ
  "29912": "NG", // LAGOS
  "99422": "GY", // LETHEM (só 2018)
  "29939": "GA", // LIBREVILLE
  "99341": "MW", // LILONGUE
  "29947": "PE", // LIMA
  "29955": "PT", // LISBOA
  "39160": "SI", // LIUBLIANA
  "29963": "TG", // LOMÉ
  "29971": "GB", // LONDRES
  "29980": "US", // LOS ANGELES
  "29998": "AO", // LUANDA
  "99287": "ZM", // LUSACA
  "30066": "ES", // MADRI
  "39263": "GQ", // MALABO
  "30082": "PH", // MANILA
  "30074": "NI", // MANÁGUA
  "30090": "MZ", // MAPUTO
  "99511": "FR", // MARSELHA
  "39102": "OM", // MASCATE
  "39004": "AR", // MENDOZA
  "30104": "MX", // MEXICO
  "30112": "US", // MIAMI
  "30120": "IT", // MILÃO
  "30147": "UY", // MONTEVIDÉU
  "30155": "CA", // MONTREAL
  "30163": "RU", // MOSCOU
  "30171": "IN", // MUMBAI
  "30180": "DE", // MUNIQUE
  "30198": "JP", // NAGÓIA
  "30201": "KE", // NAIRÓBI
  "99180": "BS", // NASSAU
  "39322": "CY", // NICOSIA
  "30210": "IN", // NOVA DELHI
  "30228": "US", // NOVA YORK
  "99490": "US", // ORLANDO
  "30244": "NO", // OSLO
  "30252": "CA", // OTTAWA
  "30260": "PA", // PANAMA
  "30279": "SR", // PARAMARIBO
  "30287": "FR", // PARIS
  "30295": "AR", // PASO LOS LIBRES
  "30309": "PY", // PEDRO JUAN CABALLERO
  "30317": "CN", // PEQUIM
  "30325": "TT", // PORT OF SPAIN
  "30341": "PT", // PORTO
  "30333": "HT", // PORTO PRÍNCIPE
  "30350": "CZ", // PRAGA
  "30368": "CV", // PRAIA
  "30376": "ZA", // PRETÓRIA
  "99155": "AR", // PUERTO IGUAZÚ
  "99236": "BO", // PUERTO QUIJARRO
  "99295": "KP", // PYONGYANG
  "30392": "EC", // QUITO
  "30406": "MA", // RABAT
  "30414": "PS", // RAMALLAH
  "30422": "SA", // RIADE
  "30430": "UY", // RIO BRANCO
  "99244": "UY", // RIVERA
  "30449": "IT", // ROMA
  "99147": "AG", // SAINT JOHNS
  "30465": "PY", // SALTO DEL GUAIRÁ
  "30473": "BO", // SANTA CRUZ DE LA SIERRA
  "99279": "VE", // SANTA ELENA DE UAIRÉN
  "30481": "CL", // SANTIAGO
  "30988": "BA", // SARAJEVO
  "30538": "KR", // SEUL
  "29548": "SG", // SINGAPURA
  "99333": "GF", // ST GEORGES DE LOYAPOCK
  "30562": "AU", // SYDNEY
  "30490": "DO", // SÃO DOMINGOS
  "30503": "US", // SÃO FRANCISCO
  "30511": "CR", // SÃO JOSÉ
  "30520": "SV", // SÃO SALVADOR
  "39225": "ST", // SÃO TOMÉ
  "30546": "BG", // SÓFIA
  "30570": "TW", // TAIPÉ
  "99317": "EE", // TALIN
  "99104": "GE", // TBILISI
  "30597": "IR", // TEERÃ
  "30600": "HN", // TEGUCIGALPA
  "30619": "IL", // TEL AVIV
  "99139": "AL", // TIRANA
  "30635": "CA", // TORONTO
  "30686": "LY", // TRÍPOLI
  "30708": "TN", // TUNIS
  "30627": "JP", // TÓQUIO
  "39284": "BF", // UAGADUGU
  "39063": "CA", // VANCOUVER
  "30740": "PL", // VARSÓVIA
  "99252": "VA", // VATICANO (só 2022)
  "30767": "AT", // VIENA
  "30783": "US", // WASHINGTON
  "30805": "NZ", // WELLINGTON
  "30821": "NA", // WINDHOEK
  "30848": "CN", // XANGAI
  "99376": "MM", // YANGON
  "39020": "HR", // ZAGREB
  "30864": "CH", // ZURIQUE
};

/** chave = código TSE da cidade do exterior (5 dígitos). */
export const CIDADE_PAIS: Record<string, { pais: string; iso2: string }> = Object.fromEntries(
  Object.entries(CIDADE_ISO2).map(([cd, iso2]) => [cd, { pais: PAIS_NOME_POR_ISO2[iso2], iso2 }]),
);
