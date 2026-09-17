<!--
  Documento original que deu origem ao projeto, preservado como está.
  É a fonte das decisões tomadas em docs/adr/ — quando um ADR contradiz este
  texto, o ADR vence, e o ADR diz por quê.

  Divergências já conhecidas em relação a este documento:
   - ingestão: watcher local (ADR 0004), não upload manual;
   - escopo: a camada agêntica entra no MVP (ADR 0005), não na fase 2.
-->

# iRacing — Telemetria (stack Node.js)

> Documento de referência do projeto.
> **Escopo do MVP: leitura de arquivos `.ibt` gerados pelo sim. Telemetria ao vivo está fora do escopo por enquanto.**

---

## Escopo

### No MVP
- Ler arquivos `.ibt` que o iRacing salva em disco ao fim da sessão
- Extrair session info (pista, carro, piloto) e as amostras de telemetria
- Processar/agregar por volta e gerar gráficos

### Fora do MVP (fase 2)
- Telemetria ao vivo via memória compartilhada
- Overlay em tempo real / agente rodando na máquina do sim
- Broadcast de comandos pro sim (câmera, pit, replay)

### Por que essa ordem

O caminho live obriga a um addon nativo em C++ rodando **na mesma máquina Windows** onde o iRacing está aberto: node-gyp, Visual Studio Build Tools, rebuild a cada troca de versão do Node, e CI que não consegue testar essa parte. O `.ibt` é só leitura de binário — roda em container Linux, hospeda normal, sem agente local e sem toolchain nativa.

E o trabalho não é jogado fora: o `.ibt` usa **a mesma estrutura de header e a mesma tabela de variáveis** da memória compartilhada. O decoder escrito pro MVP é reaproveitado quase inteiro quando o live entrar.

---

## 1. Como o `.ibt` é gerado

- No sim, **`Alt-L`** arma o sistema de telemetria (não precisa estar no carro). Um ícone aparece indicando que está armado e acende quando a gravação começa.
- **Cada vez que você entra no carro, um arquivo novo é gerado** em `Documentos\iRacing\telemetry\`.
- Também dá pra habilitar gravação permanente em `Options > Misc` dentro do sim.
- É o mesmo formato que MoTeC i2 (via conversor) e McLaren ATLAS (via plugin oficial da iRacing) consomem.

### Nota sobre o arquivo durante a sessão

Enquanto a sessão está rodando, o arquivo está sendo escrito e **fica travado pelo Windows**. Se o MVP for pegar arquivos direto da pasta, precisa tratar file-lock e arquivo incompleto (ver o projeto `iracing-telemetry-analyzer` nas referências — ele resolve exatamente isso num `watcher.js`).

Se o fluxo for upload manual pelo usuário, esse problema some.

---

## 2. Formato do `.ibt`

Estrutura do arquivo, na ordem:

1. **Header principal** (112 bytes) — `version`, `status`, `tick_rate` (normalmente 60), `session_info_offset`, `session_info_length`, `num_vars`, `var_header_offset`, `num_buf`, `buf_len`, `buf_offset`.
2. **Disk header** (32 bytes) — exclusivo do arquivo em disco, não existe na versão live: `start_date`, `start_time`, `end_time`, `lap_count`, `record_count`.
3. **String YAML de session info** — dados semi-estáticos: pista e layout, carros, pilotos (`WeekendInfo`, `SessionInfo`, `DriverInfo`).
   **Encoding: CP1252 / ISO-8859-1**, não UTF-8. Parsear como UTF-8 quebra em nome de piloto com acento.
4. **Tabela de variáveis** — array de `num_vars` entradas de 144 bytes cada. Cada entrada: `type`, `offset` (dentro do buffer de amostra), `count`, `count_as_time`, `name`, `description`, `unit`.
5. **Amostras** — `record_count` blocos de `buf_len` bytes. Cada amostra é um "frame": pra ler a variável X na amostra N, você vai em `buf_offset + (N * buf_len) + varHeader.offset`.

### Consequência prática

Não decore lista de variáveis. Monte o catálogo **em runtime** percorrendo a tabela de variáveis — o conjunto muda entre carros e entre builds do sim. Cada variável já vem com nome, tipo, unidade e count, então dá pra gerar a UI de seleção de canais dinamicamente.

### Cálculo de duração

`record_count / tick_rate` = segundos de telemetria. Ex: 3371 amostras a 60Hz ≈ 56 segundos.

---

## 3. Bibliotecas Node pro MVP

### Recomendada: `ibt-telemetry`

- npm: `npm i ibt-telemetry` — v1.1.1
- **100% JavaScript puro, sem dependência de DLL ou biblioteca do Windows** — roda em macOS, Linux e Windows igual. É exatamente o que o MVP precisa.
- Faz **streaming** das amostras direto do arquivo em vez de carregar tudo em memória, o que ajuda com arquivos grandes e com back-pressure quando o consumidor é mais lento.
- É a implementação de referência da comunidade — a crate Rust `itelem` foi escrita com base nela.

```js
const telemetry = Telemetry.fromFile('/path/to/telemetry.ibt')

const telemetryId = telemetry.uniqueId()
const sessionInfo = telemetry.sessionInfo

for (const sample of telemetry.samples()) {
  const speed = sample.getParam('speed')
  // { name: "Speed", description: "GPS vehicle speed", value: 200.32943, unit: "m/s" }

  const json = sample.toJSON()
  // { "AirTemp": { unit: "C", value: 25.55 }, "Brake": { unit: "%", value: 1 }, ... }
}
```

**Ressalva honesta:** última publicação há ~4 anos. O formato do `.ibt` é estável, então provavelmente funciona sem problema — mas valide com um arquivo recente logo no começo. Se der problema, o parser é pequeno o suficiente pra forkar ou reescrever (a spec está na seção 2).

### Alternativas

| Opção | Nota |
|---|---|
| `@emiliosp/node-iracing-sdk` | Tem classe `IBT` pra ler arquivos, mas o README exige Node 24+ **e Windows** — o requisito de Windows provavelmente vem da parte live. Só vale se você for usar live também. Atenção: o README manda instalar `irsdk`, mas o nome publicado no npm é escopado |
| `matthias-hampel/iracing-ibt-parser` | Exemplo mínimo em TypeScript. Não é lib, é referência de como parsear |
| Parser próprio | Viável. A spec cabe em umas 200 linhas de TS com `Buffer.readInt32LE` / `readFloatLE`. Vale se as libs existentes atrapalharem mais do que ajudarem |

### Não usar no MVP

`irsdk-node`, `node-irsdk-mjo`, `node-irsdk-2023` — todos são pra telemetria ao vivo e arrastam addon nativo. Ficam pra fase 2.

---

## 4. Arquitetura do MVP

```
iRacing (Alt-L) → arquivo .ibt em Documentos\iRacing\telemetry\
  → upload pelo usuário (ou watcher local, se for app desktop)
  → parser Node no backend (Linux/Docker, sem addon nativo)
  → normalização por volta + persistência
  → API → gráficos no front (React/Next.js)
```

### Decisões que valem a pena decidir cedo

- **Upload vs watcher local.** Upload é muito mais simples de hospedar. Watcher só se o produto for desktop.
- **Downsampling.** 60Hz numa stint de 30min dá ~108k amostras por canal. Pro gráfico na tela, você não precisa disso tudo — decida se guarda tudo cru e agrega na leitura, ou se já reduz na ingestão.
- **Cache do parse.** Parsear o mesmo arquivo toda vez é desperdício. O `iracing-telemetry-analyzer` persiste o resultado parseado em disco justamente por isso.
- **Detecção de volta.** As amostras não vêm agrupadas por volta — você separa usando o canal de lap/distância. Essa lógica é o núcleo do produto, não o parser.

### O que já preparar pensando na fase 2

Isolar o decoder (header + tabela de variáveis + leitura de amostra) num módulo puro, sem I/O. Assim, quando o live entrar, ele só troca a fonte dos bytes (memória compartilhada em vez de arquivo) e reaproveita todo o resto.

---

## 5. Fase 2 — telemetria ao vivo (referência)

Guardado aqui só pra não perder o contexto. **Não implementar agora.**

- Região de memória: `Local\IRSDKMemMapFileName`, atualizada ~60Hz enquanto o sim roda.
- Mesma estrutura do `.ibt`, sem o disk header, e com **até 4 buffers em double-buffering** — o sim alterna a escrita pra que quem lê sempre pegue um frame consistente.
- Ao ler várias variáveis do mesmo tick (ex: todos os `CarIdxXXX`), congele/atualize o buffer no início do loop antes de qualquer leitura. No `pyirsdk` é `freeze_var_buffer_latest()`; no `@emiliosp` é `refreshSharedMemory()`. Sem isso você mistura dados de ticks diferentes.
- Lib Node mais forte: `irsdk-node` (v4.4.0), wrapper type-safe sobre bindings do SDK C++, com tipos TS. Pacote nativo por baixo: `@irsdk-node/native` (v5.4.0, iRacing SDK v1.19).
- Custo: node-gyp, Python 3, VS Build Tools, Windows x64, rebuild por versão de ABI do Node, `electron-rebuild` se for Electron.

---

## 6. Fontes

### Oficiais
- **Guia oficial de telemetria em disco** (PDF da iRacing — explica o `Alt-L` e a pasta de telemetria): https://ir-core-sites.iracing.com/members/atlas/atlas_quickstart.pdf
- **SDK C++ oficial (`irsdk.h`)** — fórum iRacing, requer assinatura ativa: https://forums.iracing.com/discussion/62/iracing-sdk

### Spec do formato (engenharia reversa da comunidade)
A iRacing não publica a descrição do formato binário publicamente. Estas são as melhores referências escritas:
- **Crate `itelem` (Rust)** — a referência mais limpa do formato `.ibt`, com tamanhos de header e structs: https://docs.rs/crate/itelem/latest
- **Crate `iracing` (Rust)** — melhor explicação do layout da memória compartilhada: https://docs.rs/crate/iracing/latest
- **`goiracing` (Go)** — formato do header de variável: https://pkg.go.dev/github.com/margic/goiracing
- **Wiki não-oficial do SDK/API**: https://iracingsdk.fandom.com/wiki/IRacing_SDK_and_API_Documentation_Wiki

### Libs e projetos de referência (Node/TS)
- **`ibt-telemetry`** (a recomendada): https://github.com/SkippyZA/ibt-telemetry · https://www.npmjs.com/package/ibt-telemetry
- **`iracing-telemetry-analyzer`** — app Node completo de análise de `.ibt` com parser, watcher, cache e gráficos. Melhor referência de arquitetura pro MVP: https://github.com/PulsePanda/iracing-telemetry-analyzer
- **`TRACE.IT`** — analisador de `.ibt` em TypeScript: https://github.com/naizens/TRACE.IT
- **`iracing-ibt-parser`** — exemplo mínimo em TS: https://github.com/matthias-hampel/iracing-ibt-parser
- **Lista de projetos iRacing em TypeScript**: https://github.com/topics/iracing?l=typescript

### Fase 2
- `irsdk-node`: https://www.npmjs.com/package/irsdk-node
- `@irsdk-node/native`: https://www.npmjs.com/package/@irsdk-node/native
- `emilioSp/node-iracing-sdk`: https://github.com/emilioSp/node-iracing-sdk
- `pyirsdk` (referência de facto da comunidade): https://github.com/kutu/pyirsdk

---

## 7. Pendências pra validar

- [ ] Testar `ibt-telemetry` com um `.ibt` gerado por uma build recente do iRacing (lib parada há ~4 anos)
- [ ] Confirmar se todas as variáveis necessárias existem no `.ibt` ou se alguma só aparece no stream live
- [ ] Definir estratégia de downsampling antes de modelar a persistência
- [ ] Decidir upload manual vs watcher local
