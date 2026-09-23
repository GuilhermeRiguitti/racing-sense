# ADR 0017 — O desktop é o produto; a nuvem é acessório

**Status:** Aceito · 2026-09-18
**Refina:** ADR 0011 (topologia), ADR 0013 (publicação), ADR 0016 (origem única)

## Contexto

Os ADRs anteriores descreveram *como* as três aplicações se separam, mas não
disseram **qual delas é o produto**. Sem isso, cada decisão de sincronização
parece merecer o mesmo cuidado, e o esforço se espalha: o ADR 0016 chegou a
listar "não dá para reprocessar no servidor" como custo a mitigar, e as
pendências pediam reconciliação entre os dois lados.

Isso inverte a prioridade real.

## Decisão

**O aplicativo do desktop é o produto.** Ele é o coach que o piloto deixa
aberto enquanto treina: os dados dele precisam estar sempre disponíveis,
sempre atuais e apresentados bem — gráficos legíveis, comparação clara,
navegação rápida entre voltas.

**A web e a cloud-api são funcionalidade extra**, para depois: compartilhar uma
volta com um amigo, comparar com a dele, ter um perfil. Úteis, não essenciais.

Disso decorre, explicitamente:

1. **Divergência entre local e nuvem é aceitável.** Se o desktop reprocessa uma
   sessão com um algoritmo melhor e não republica, a nuvem fica com a versão
   antiga — e está tudo bem. Ninguém decide nada olhando o feed.
2. **Não se constrói reconciliação.** Nada de versionamento de payload, resolução
   de conflito, invalidação de cache ou job de re-sincronização. Se um dia fizer
   falta, é outro ADR — e provavelmente é mais barato republicar tudo.
3. **A nuvem atrasar não é incidente.** A fila de publicação existe para o dado
   não se perder, não para garantir prazo de entrega.
4. **Esforço vai para o desktop.** Entre "melhorar o gráfico de delta" e
   "melhorar a consistência da nuvem", o gráfico ganha, sempre.

## A única exceção, e ela não é sobre sincronização

Apagar uma sessão no desktop precisa poder apagar na nuvem. Isso não é
consistência de dados — é o piloto retirando algo que ele publicou. Continua em
`docs/pendencias.md` como obrigação, não como sync.

## O que se aceita perder

- **Uma sessão pode aparecer diferente nos dois lugares.** Quem comparar a tela
  do desktop com a da web pode ver tempos ligeiramente distintos se o
  reprocessamento aconteceu entre uma coisa e outra. É confuso, e é barato de
  explicar com um "processado em <data>" na web.
- **A rede social nasce mais pobre** do que nasceria se ela fosse prioridade.
- **Republicar em massa** é a única ferramenta se um dia a nuvem precisar
  emparelhar com o local. Assumido: é mais simples que manter máquina de
  reconciliação viva o ano inteiro.

## Sinal para reverter

Se a web virar a porta de entrada do produto — pilotos usando o feed para
escolher com quem comparar antes de abrir o desktop — a prioridade muda e este
ADR é superado. Até lá, o critério é: **o piloto acabou de sair do carro e quer
ver onde perdeu tempo.** O que serve a esse momento vem primeiro.
