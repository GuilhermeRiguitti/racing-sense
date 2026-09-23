# Glossário

Termos que aparecem no código e na documentação. Quem nunca abriu um software de
telemetria de corrida não precisa adivinhar.

| Termo | O que é |
|---|---|
| `.ibt` | iRacing Binary Telemetry: o arquivo que o sim grava em disco por entrada no carro |
| Alt-L | Atalho no sim que arma a gravação de telemetria |
| Amostra / sample | Um instante com todos os canais medidos. A 60 Hz, 60 por segundo |
| Canal / channel | Uma grandeza medida: `Speed`, `Brake`, `Throttle`, `SteeringWheelAngle` |
| Tick rate | Amostras por segundo. Normalmente 60 |
| `bufLen` | Tamanho em bytes de uma amostra: todos os canais de um instante |
| Tabela de variáveis | Bloco do arquivo que descreve cada canal: nome, tipo, unidade, offset |
| Session info | YAML com pista, carro, pilotos e configuração da sessão |
| `LapDistPct` | Posição na volta, de 0 a 1. O eixo usado em toda comparação |
| Volta de referência | Volta guardada para comparar com as outras. Pode vir de outro piloto |
| Delta | Diferença de tempo acumulada contra a referência, ao longo da distância |
| Out lap | Volta de saída dos boxes. Não serve para comparação |
| In lap | Volta de entrada nos boxes. Idem |
| Stint | Sequência de voltas entre duas paradas |
| Setor | Trecho da pista usado para tempos parciais |
| `CarIdx*` | Canais indexados por carro: um valor por carro na sessão (`count > 1`) |
| Memória compartilhada | Região que o sim atualiza a ~60 Hz para telemetria ao vivo (fase 2) |
| Double buffering | O sim alterna buffers de escrita para o leitor pegar frame consistente |
| MoTeC i2 / ATLAS | Softwares de análise profissional que consomem o mesmo formato |
