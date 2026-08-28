# Conta Azul — a API está bloqueada por status de plano

Achado de 28/08/2026. **Bloqueia as etapas 3 em diante da integração.**

## O que acontece

Toda requisição à API, em qualquer caminho, devolve:

```
HTTP 403
{
  "descricao_erro": "A conta não está elegível para uso da API devido ao status atual do plano.",
  "status_conta": "BLOQUEADA"
}
```

Foram sondados 46 caminhos, incluindo `/v1/` e um inventado
(`/v1/caminho-que-nao-existe-xyz`). **Todos devolvem o mesmo 403.** Um 403 idêntico num
caminho que não existe prova que a API nem chega a resolver a rota — é o porteiro barrando
antes. Não é endpoint errado, não é escopo, não é bug do nosso código.

## O que está funcionando

O OAuth está completo e validado:

- Autorização, troca de code por token e renovação automática funcionam
- O token é lido do banco, o JWT é válido (`iss: https://api-v2.contaazul.com`), expira certo
- Status **CONECTADO** na tela `/app/integracoes/contaazul`

O bloqueio é a camada seguinte: autenticação passa, autorização de plano não.

## Segundo achado — o escopo concedido não é o pedido

| | |
|---|---|
| Pedido na autorização | `openid+profile+aws.cognito.signin.user.admin` |
| Recebido no access_token | `openid profile email` |

Voltou `email` no lugar de `aws.cognito.signin.user.admin`. Hoje está encoberto pelo bloqueio
de plano, mas é candidato a ser o **próximo** obstáculo assim que a conta liberar. Conferir no
portal do desenvolvedor quais escopos o App tem permissão de pedir.

## Conta envolvida

App de desenvolvimento `DEV-GUSTAVO-1787929011353`, com a conta ERP de teste
(`...@devportal.com`). A conta de teste do portal do desenvolvedor tem validade de 30 dias,
prorrogável — expiração é a hipótese mais provável para o status `BLOQUEADA`.

## O que destrava

Não é configuração nossa. É suporte/comercial da Conta Azul, por dois caminhos independentes:

1. **Curto prazo** — Gustavo pede a renovação ou o desbloqueio da conta de teste no portal do
   desenvolvedor, para a integração poder ser construída e validada.
2. **Prazo real** — confirmar se o **plano da Conta Azul da GRD** inclui acesso à API. Essa
   pergunta está aberta desde o começo do projeto e nunca foi respondida. Se a resposta for
   não, nenhuma linha de código resolve: vira upgrade de plano antes de qualquer outra coisa.

## O que foi deixado pronto

- `src/scripts/contaazul-explorar.ts` — sonda a API com o token real, respeita o rate limit,
  agrupa assinaturas de erro e imprime os escopos concedidos. Foi ele que revelou o bloqueio
  em vez de transformar isso numa caçada a nomes de endpoint.
- Rodar com: `node --import ./src/scripts/_alias.mjs src/scripts/contaazul-explorar.ts`

## O que NÃO foi feito, de propósito

Sem uma única resposta `200`, não se conhece o caminho de contas a receber/pagar, o formato de
paginação, a existência de filtro por data de alteração, nem um só nome de campo real.

Modelar `ca_lancamentos` agora seria inventar o mapeamento inteiro — o tipo de erro que só
aparece semanas depois, quando os números não batem. As tabelas espelho ficam para depois da
descoberta.
