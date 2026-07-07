## Objetivo
Aumentar o logo do Grupo GRD em todos os pontos onde ele aparece, mantendo proporção e boa aparência.

## Mudança
Aumentar o tamanho padrão do componente `Logo` (`src/components/brand/Logo.tsx`) de `size=44` para `size=64` (aprox. +45%). Como praticamente todos os call sites (`Header`, `Footer`, `PortalLayout` desktop e mobile, `LoginPage`) usam `<Logo />` sem prop `size`, todos herdam o novo tamanho de uma vez.

Ajustes pontuais para acomodar sem quebrar o layout:
- **PortalLayout**: aumentar altura da faixa do logo na sidebar (`h-16` → `h-20`) e do drawer mobile idem, para o logo maior respirar.
- **Header (site)**: aumentar `h-16` → `h-20` para o novo logo caber com folga.
- **Ponto/Webmail**: já usam `size={80}` explicitamente — aumentar para `size={112}` para manter proporção visual coerente com o novo padrão.
- **LogoMark**: manter default `40` (usado como favicon-like, não é o logo cheio).

## Arquivos afetados
- `src/components/brand/Logo.tsx` — novo default de `size`
- `src/components/portal/PortalLayout.tsx` — altura da faixa do logo (desktop + mobile drawer)
- `src/components/site/Header.tsx` — altura do header
- `src/routes/app.webmail.tsx`, `src/routes/app.ponto.tsx` — aumentar `size` do logo grande

## Validação
Rodar a preview em `/`, `/login`, `/app`, `/app/webmail` — o logo deve aparecer visivelmente maior e alinhado, sem cortar nem empurrar itens da topbar/sidebar.