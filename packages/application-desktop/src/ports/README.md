# Portas

Interfaces que a aplicação **exige** do mundo externo. Quem implementa é um
adapter, e é o composition root de cada aplicação que escolhe qual.

Duas regras:

1. **A porta é declarada por quem a usa, não por quem a implementa.** É isso que
   inverte a dependência: o adapter é que depende da aplicação.
2. **Porta é estreita.** Uma capacidade por interface. Porta gorda obriga o
   adapter de teste a implementar método que ninguém chama naquele caso de uso.

O tipo que atravessa a porta é sempre do domínio. Se um tipo de biblioteca
(`Buffer`, `Request`, `LanguageModel`) aparece numa assinatura aqui, a lib
vazou — e trocá-la volta a ser refatoração.
