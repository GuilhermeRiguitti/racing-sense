# @telemetry/adapter-http

Cliente da cloud-api, usado pelo app do Windows para publicar sessões, descobrir
voltas de outros pilotos e autenticar.

## `fetch` é injetado

O pacote não usa o `fetch` global. No Electron entra o `net.fetch` ligado à
sessão do app — que é quem guarda e reenvia o cookie selado do login. Em teste
entra um `fetch` falso. Este pacote não sabe a diferença, e por isso roda sem
rede no CI.

## Falha de rede não é exceção

Ficar offline é o estado normal de quem treina. `CloudRequestError` com
`status: null` significa "sem rede": a fila de publicação trata e tenta de novo.
`401` em `/auth/me` significa "não logado", não falha — o app abre igual e só
esconde o que depende da nuvem.
