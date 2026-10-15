# [AUDITORIA] 07 — Fase 5 — Progresso

**Fase:** 5 — Dashboard e experiência da biblioteca  
**Passo:** 1 — Redesign da Home  
**Status:** Concluído

## Refinamento da Home, tema e Hub NotebookLM

- Criada a preferência global única `mindnote_theme_pref`, aplicada antes da renderização com fallback para `prefers-color-scheme`.
- Sincronizada a alternância do tema entre Home e Editor; o tema salvo prevalece ao abrir mapas existentes.
- Removido o atalho órfão de importação da seção “Seus mapas”; o botão “+ Novo Mapa” agora abre opções para criar raiz em branco ou importar JSON.
- Adicionado modal de importação com validação recursiva dos campos `titulo`, `anotacao`, `cor` e `filhos` antes de abrir o Editor.
- Adicionado Hub de IA com cópia do prompt mestre compatível com o schema MindNote e link externo seguro para o NotebookLM.

## Passo 2 — Painel Central de Configurações

- Criado o modal responsivo Liquid Glass com abas Geral, Sincronização e Desenvolvedor, fechamento por X, backdrop e Escape.
- Integrada a escolha de tema Claro/Escuro/Seguir Sistema à chave única `mindnote_theme_pref`; adicionada preferência de entrelinha padrão.
- Criada a aba BYOB com preenchimento e persistência local de URL Supabase, chave pública e senha E2EE, validação e alternância de visibilidade dos campos secretos.
- Criadas métricas locais, exportação completa JSON e restauração validada de backups MindNote; as miniaturas SVG importadas são sanitizadas.
- Adicionado reset local com confirmação em duas etapas.
- Controlador inicial isolado: `js/settings.modal.js` (a implementação foi posteriormente consolidada e expandida em `js/settings.manager.js`).

## Entregas

- Substituída a Home legada por um dashboard responsivo com marca, busca, ações de cabeçalho, área de conteúdo e estado vazio.
- Criados cartões de mapas com miniatura SVG, título truncado, data de modificação, elevação tátil e menu contextual em Liquid Glass.
- Implementada busca instantânea por título, com debounce de 150 ms e estado “Nenhum mapa encontrado”.
- Ligadas as ações Abrir, Renomear, Duplicar e Excluir aos contratos existentes de `MindNoteRouter` e `MindNoteDB`.
- Ligados os botões de criação imediata de mapa vazio e mantida a importação JSON existente.
- Adicionados botões de Sincronizar e Configurações como pontos de entrada preparados para fases futuras.

## Arquivos alterados

- `index.html`
- `css/design-system.css`
- `js/settings.modal.js`
- `js/app.js`
- `js/app.router.js`
- `js/home.dashboard.js`

## Validação

Os módulos `js/settings.modal.js`, `js/home.dashboard.js`, `js/app.js` e `js/app.router.js` passaram pela validação sintática com `node --check`; uma checagem estática confirmou IDs, ordem de carregamento e APIs do banco; `git diff --check` não apontou problemas. A inspeção de execução no navegador segue bloqueada: o navegador integrado rejeitou o servidor local com `ERR_BLOCKED_BY_CLIENT`, então o console não pôde ser verificado visualmente. Os módulos de geometria, texto e exportação PDF permanecem intocados.

## Fase 5 — Sidebar, configurações expandidas e modo desenvolvedor

- Reestruturada a Home em duas colunas com sidebar nativa, contadores de mapas/favoritos, navegação de coleções e status visual da configuração BYOB.
- Adicionada organização funcional por favoritos e pastas/cadernos. O IndexedDB passou à versão 2 com store `maps_categories`, migração das categorias legadas e operações para criar/remover categorias, atualizar organização e limpar o banco.
- Implementado o easter egg de cinco cliques no logotipo em até dois segundos; o modo desenvolvedor persiste em `dev_mode_unlocked`, pode ser bloqueado com o mesmo gesto e exibe toast de estado.
- A central de configurações agora ocupa um painel amplo na área principal da Home, com abas Usuário & Aparência, Canvas & Entrada, Exportação PDF, Sincronização BYOB e Desenvolvedor (oculta até o desbloqueio).
- Preferências funcionais persistidas: tema Claro/Escuro/Sistema, variante Liquid Glass/Solid Minimalist, entrelinha mínima de 26 px, auto-ocultação de barras touch, sensibilidade de pan/zoom, trava de rotação e limites de zoom.
- Na implementação inicial, a configuração de exportação ficava em `js/settings.manager.js`; esse caminho foi removido na auditoria crítica abaixo e a exportação retornou ao renderer vetorial.
- A aba BYOB valida e salva URL HTTPS, chave anon e senha E2EE localmente, testa o endpoint REST do Supabase e apresenta a política Last-Write-Wins por timestamp.
- O modo desenvolvedor exibe contagens exatas das stores, versão do IndexedDB, estimativa de armazenamento, heap quando disponível e nós do grafo ativo; inclui monitor de FPS, overlay ciano das hitboxes, backup/restauração JSON validados e reset com digitação obrigatória de `RESETAR`.
- Novos módulos: `js/home.sidebar.js` e `js/settings.manager.js`; scripts carregados antes de `js/app.js`. `js/db.js`, `js/render.svg.js`, `js/app.js`, `js/app.router.js`, `js/home.dashboard.js`, `index.html` e `css/design-system.css` foram integrados sem alterar os três módulos sob blindagem.

## Arquivos e validação da entrega

- Atualizados: `index.html`, `css/design-system.css`, `js/db.js`, `js/home.dashboard.js`, `js/home.sidebar.js`, `js/settings.manager.js`, `js/app.js`, `js/app.router.js`, `js/render.svg.js` e `js/canvas.zoomdock.js`.
- Criados: `js/home.sidebar.js` e `js/settings.manager.js`.
- Os oito módulos JavaScript da entrega passaram por `node --check`; a checagem estática confirmou IDs únicos, chaves CSS balanceadas, ordem dos scripts e `git diff --check` sem erros.
- `js/engine.geometry.js` e `js/engine.text.js` permaneceram intactos; `js/render.pdf.js` foi atualizado nesta correção. O teste visual em navegador ainda não foi executado nesta entrega.

## Auditoria crítica — PDF, câmera, Home e telemetria

- O botão do Editor voltou a chamar o exportador vetorial `exportarPDFContinuo`; removido o caminho alternativo que comprimia a árvore numa página fixa.
- O PDF usa bounding box do grupo SVG renderizado, dimensões dinâmicas `W + 80 px` × `H + 80 px`, offset de 40 px e coordenadas sem escala. Textos usam linhas, corpo de 15 px e avanço de 22 px do SVG; conectores Bézier, caixas e pautas permanecem vetoriais.
- Removidos da interface e do gerenciador os controles e referências de folha fixa, orientação e margem de impressão.
- O zoom mínimo padrão e permitido foi ajustado para 0,1×; a trava de 160 px foi removida do pinch. O zoom máximo continua configurável até 10× e a câmera/Zoom Dock aplicam os limites persistidos. Removido o controle de auto-ocultar barras da aba Canvas.
- A configuração foi convertida em página ampla dentro de `#mn-home-content`, com a área externa sem rolagem concorrente e o conteúdo das abas como único painel rolável.
- O botão kebab dos cartões interrompe propagação e o cartão aberto recebe prioridade de empilhamento para manter o menu flutuante acima da grade.
- O teste BYOB normaliza URL, chave e senha; remove barras finais, consulta `/rest/v1/` com `apikey` e `Authorization: Bearer …` e considera HTTP 200 a confirmação positiva.
- Adicionado monitor RAF contínuo em janelas de 500 ms, HUD opcional no Editor e telemetria sincronizada nos Metadados dos Bastidores: FPS, heap, bounding box e total de nós.
- Arquivos protegidos `js/engine.geometry.js` e `js/engine.text.js` permaneceram intactos. `js/render.pdf.js` foi corrigido para implementar o contrato vetorial solicitado.

## Fechamento de auditoria — Fase 5, Etapa 1

Esta seção registra a análise forense das regressões reportadas e a correção consolidada antes do commit.

### Exportação PDF vetorial 1:1

- **Causa raiz:** foi introduzido um exportador paralelo que tentava acomodar o grafo inteiro em uma folha A4 fixa. A escala resultante comprimia um grafo de milhares de pixels, causando deformação anamórfica horizontal, nós achatados/encavalados e palavras quebradas verticalmente.
- **Correção:** descartado o caminho de exportação A4; o botão do Editor voltou ao renderer vetorial oficial em `js/render.pdf.js`. O tamanho da página é calculado a partir do bounding box real do SVG: `W + 80 px` por `H + 80 px`, com respiro de 40 px por lado. Nós, curvas, texto e pautas são desenhados em coordenadas e dimensões compatíveis com o SVG, sem escala proporcional para folha fixa nem cortes artificiais.
- **Blindagem:** `js/engine.geometry.js` e `js/engine.text.js` não foram alterados.

### Câmera e zoom

- **Causa raiz:** limites rígidos de viewBox baseados em 160 px impediam afastar a câmera o suficiente para visualizar mapas extensos.
- **Correção:** removida a trava de 160 px e revistos os cálculos inversos do viewBox. O piso de magnificação é 0,1× e o teto configurável permite 1,5× ou mais (até 10× na configuração atual), incluindo pinch capacitivo e controles táteis. Também foi removida a preferência de ocultação automática de barras da aba Canvas.

### Menu kebab dos mapas

- **Causa raiz:** o evento do botão de três pontos propagava até o cartão, cujo clique navega ao Editor, abrindo o mapa ao tentar acessar ações rápidas.
- **Correção:** o acionador interrompe a propagação com `e.stopPropagation()` e cancela a ação padrão com `e.preventDefault()`. A classe de estado do cartão eleva o popover na pilha visual para que ele permaneça utilizável sobre a grade.

### Sincronização BYOB / Supabase

- **Causa raiz:** o teste consultava endpoint de tabela sem garantia de existência e enviava credenciais sem sanitização consistente, resultando em HTTP 401.
- **Correção:** URL, chave e senha passam por `.trim()`; barras finais são removidas da URL. O teste faz GET em `${baseUrl}/rest/v1/`, envia `apikey` e `Authorization: Bearer <chave>` e considera HTTP 200 confirmação de credenciais válidas.

### Central de Configurações

- **Causa raiz:** manter as preferências dentro de um modal estreito, com rolagem externa e interna simultâneas, truncava conteúdo e prejudicava a navegação.
- **Correção:** a Central foi integrada à área principal `#mn-home-content` como página ampla. A área externa não disputa rolagem; o conteúdo da configuração tem seu painel rolável próprio e espaçamento adequado.

### Telemetria de desenvolvedor e Bastidores

- **Correção:** o monitor de FPS usa `requestAnimationFrame` em ciclo contínuo, publicando amostras a cada 500 ms. Quando habilitado, o HUD opcional no Editor mostra FPS, heap (quando suportado) e quantidade de nós. A aba Metadados dos Bastidores espelha FPS, heap, dimensões do bounding box e nós do grafo.

### Verificações do fechamento

- Sintaxe JavaScript verificada com `node --check` nos módulos alterados; checagens estáticas de IDs e CSS e `git diff --check` concluídas sem erros.
- Nenhuma alteração em `js/engine.geometry.js` ou `js/engine.text.js`.
- A inspeção visual no navegador não foi realizada nesta entrega.

## Correções de causas raiz — Zoom, telemetria, PDF e BYOB

- **Zoom sem teto de aproximação:** removido o limite máximo de 10× da câmera, do Zoom Dock e do gesto wheel/pinch, além do limite configurável máximo. O clamp comum em `MindNoteCamera.limitarEstadoZoom()` conserva apenas o piso de 1 px para largura/altura do viewBox e o zoom mínimo de afastamento configurado. Removido o campo de zoom máximo da interface, que mantinha um teto padrão mesmo após retirar o limite 10×.
- **Telemetria dos Bastidores:** `obterSnapshotTelemetria()` foi incluída na API pública de `MindNoteSettings`, e o adaptador `MindNoteDevTelemetry` passou a delegar nessa API, corrigindo a referência fora do escopo da IIFE. `open()` agora garante o evento `mindnote:backstage-change` em `finally`, iniciando o monitor RAF imediatamente mesmo se a amostra inicial falhar. O loop continua atualizando FPS, heap, bounding box e nós ativos a cada 500 ms.
- **Texto PDF:** a posição das linhas agora replica o cálculo do primeiro `tspan` SVG a partir de `dimensoes.titulo.linhasQuebradas`, com avanço fixo de 22 px e alinhamento `middle` no jsPDF. A sequência vetorial mantém conectores atrás dos nós, como no renderer SVG, e desenha pílulas antes das caixas de anotação. Bounding box e página continuam dinâmicos em `W + 80 px` por `H + 80 px`.
- **BYOB:** o teste persiste URL base normalizada, chave e senha aparadas antes da requisição, exige HTTPS e URL base sem caminho/query/hash, e exibe sucesso como “Conectado à API REST · HTTP 200” com indicação explícita de que acesso/criação da tabela de dados ainda não foi verificado. Erros de armazenamento local são informados.
- **Blindagem:** `js/engine.geometry.js` e `js/engine.text.js` permaneceram intocados.
- **Validação desta correção:** `node --check` passou em `canvas.camera.js`, `canvas.zoomdock.js`, `backstage.panel.js`, `render.pdf.js`, `render.svg.js` e `settings.manager.js`; `git diff --check` passou. IDs DOM usados pela telemetria, configuração de zoom e teste BYOB conferidos; três folhas CSS existentes passaram pela contagem de chaves balanceadas. Os módulos protegidos não aparecem no diff.

## Etapa 0 — Rota de Configurações e telemetria em tempo real

- Criada a view de nível raiz `#view-config`, irmã de `#view-home` e `#view-editor`, com sidebar própria e shell de preferências em tela cheia. A antiga marcação de configurações foi removida da Home.
- O roteador reconhece `#/config` e `#config`, lê uma aba opcional pela query string, alterna entre Home, Editor e Configurações, preserva o Editor ao voltar da rota e fecha Bastidores ao sair do Editor. Os atalhos da sidebar da Home, BYOB e barra superior do Editor navegam pela API do roteador.
- A navegação de preferências contém oito abas: Usuário, Canvas, PDF, Sync, Layout, IA Hub, Pautas e Dev (visível conforme o modo desenvolvedor). A view usa layout responsivo e mantém a rolagem do conteúdo dentro da shell.
- Em Bastidores → Metadados, a seleção da aba faz uma leitura imediata pelo adaptador `MindNoteDevTelemetry` e inicia atualização a cada 500 ms de FPS, heap, bounding box e nós. O intervalo é encerrado ao fechar a gaveta ou retornar ao JSON; o monitor RAF de FPS também acompanha a visibilidade da aba.
- O clique do menu kebab dos cartões chama `preventDefault()` e `stopPropagation()` antes de consultar ou alternar o popover, mantendo o mapa atual fechado ao abrir ações.
- Blindagem: `js/engine.geometry.js` e `js/engine.text.js` permanecem intactos.

## Etapa 1 — Abas Usuário & Aparência e Pautas & Calibração

- **Usuário & Aparência:** adicionado tema segmentado (claro/escuro/sistema), cartões Liquid Glass/Solid Minimalist, slider de blur 8–40px, seis swatches de acento e densidade compacta/confortável. Preferências persistidas nas chaves `mindnote_theme_pref`, `mn_ui_variant`, `mn_blur_intensity`, `mn_accent_color` e `mn_ui_density`; alterações comunicadas pelo barramento `mindnote:theme-change` e `mindnote:settings-change`.
- **Pautas & Calibração:** adicionados quatro modelos de pauta, stepper de entrelinha 18–36px, controles de espessura/opacidade, fonte de título e prévia SVG reativa. As chaves `mn_default_ruling_type`, `mn_ruling_line_height`, `mn_ruling_stroke_width`, `mn_ruling_opacity` e `mn_font_family_title` são persistidas imediatamente; mudanças vetoriais emitem `mindnote:ruling-change`. O modelo selecionado é anexado às novas anotações; o cálculo do Editor foi conectado à entrelinha de 18–36px e reprocessa o mapa aberto.
- **Prévia e layout:** preview em SVG inline reage aos controles sem recarregar; CSS das seções, cartões, swatches e preview acomoda tablet/mobile e mantém a rolagem no contêiner central.
- **Auditoria:** `ESPECIFICACAO_CENTRAL_CONFIGURACOES_2.md` não estava presente no workspace; implementação baseada nos contratos completos desta solicitação. `engine.geometry.js` e `engine.text.js` não foram alterados.

## Etapa 2 — Abas Canvas & Entrada e Exportação PDF

- **Canvas & Entrada:** substituídos os controles legados por sensibilidade de pan (0,5×–2×), curva suave/linear, limite de afastamento (10–50%), limite de aproximação (100–800%), trava de rotação e modo de caneta estrita. `obterCanvasConfig()` expõe os valores atuais; `MindNoteCamera.calcularFatorZoom()` centraliza a progressão aplicada pelo pinch, wheel e Zoom Dock. No modo de caneta estrita, somente ponteiros `pen` ativam hitboxes/controles; demais ponteiros navegam o canvas.
- **Exportação PDF:** adicionadas margem configurável (20–150px, padrão 60), formato contínuo (padrão) e opções de paginação A4 paisagem/A3 em ladrilhos vetoriais 1:1, paridade de tema, visibilidade das pautas e metadados. O Bounding Box usa o `getBBox()` real do SVG quando disponível, com a margem simétrica definida; fallback geométrico mantém a mesma regra. O modo contínuo instancia o jsPDF no tamanho exato `W + 2*margem` por `H + 2*margem`.
- **Contratos de persistência:** cada controle salva sua chave `mn_*` em alteração e anuncia `mindnote:settings-change`; o PDF lê as preferências persistidas no início da exportação. A política de página contínua 1:1 segue como padrão; nenhum papel fixo é usado por padrão.
- **Validação:** `node --check` executado nos módulos JavaScript alterados, IDs HTML sem duplicações, chaves CSS balanceadas e `git diff --check` sem erros. `engine.geometry.js` e `engine.text.js` permanecem intocados.

## Etapa 3 — Abas Layout & Motor Geométrico e IA Hub

- **IA Hub:** criado catálogo selecionável de quatro prompts especializados (vestibular, exatas, biologia e história), preview monospaçado e botão de cópia com feedback tátil, além do link seguro para NotebookLM. A preferência de prompt é salva em `mn_prompt_template_active`; Home e Editor copiam o prompt ativo.
- **Higienização:** adicionados os switches `mn_sanitizer_aggressive`, `mn_sanitizer_multi_modal` e `mn_markdown_outline_support`, conectados ao sanitizador usado tanto no Editor quanto na importação da Home. Múltiplos blocos permitem escolha ou união de raízes; outline Markdown é convertido ao schema MindNote.
- **Layout:** adicionados cards ilustrados para árvore horizontal, radial, grid livre e briefing vertical, calibração dos três gaps e tensionamento Bézier com rota ortogonal opcional. `obterLayoutConfig()` expõe parâmetros; `app.js` aplica layout/intervalos após o cálculo protegido e antes do SVG, sem editar os motores geométricos/textuais.
- **Barramento e persistência:** cada seleção/controle persiste em `localStorage` e publica evento `mindnote:prompt-template-change`, `mindnote:sanitizer-config-change` ou `mindnote:layout-change` (além do evento geral de configuração).
- **Validação:** `node --check` nos módulos JavaScript alterados, `git diff --check`, contagem de IDs, balanceamento CSS e smoke test do outline com nível aninhado. Os módulos `engine.geometry.js` e `engine.text.js` permanecem intocados.

## Correção de runtime — travamento da Home e integridade das rotas

- **Causa raiz no fluxo:** os handlers das preferências de layout e entrelinha chamavam `MindNoteApp.reprocessarERenderizar()` sem verificar a view ativa. Essa chamada alcançava geometria/SVG mesmo com o Editor oculto, misturando estado de configurações com ciclo de renderização do canvas. O bootstrap do Editor também usava ouvintes DOM sem guarda nos elementos obrigatórios, tornando uma divergência de markup uma exceção não tratada; o clique delegado da Home assumia que `event.target` sempre expunha `.closest()`.
- **Correção:** centralizado em `settings.manager.js` o despacho de recálculo, condicionado ao `#view-editor` estar visível; `app.js` passou a aplicar a mesma barreira no início de `reprocessarERenderizar()` e a validar os elementos obrigatórios do bootstrap antes de instalar os handlers. As ações das Abas 5/6 agora obtêm alvos com `event.target?.closest?.(...)` e validam o alvo antes de ler `dataset`.
- **Router Integrity:** a troca de rotas oculta a view de saída e revela a de entrada no mesmo turno de execução, em vez de aguardar 220 ms. Assim, `#/config` mostra `#view-config` e oculta a Home imediatamente, sem listeners de navegação circulares; o callback de cada destino é chamado após a atualização síncrona do estado da view.
- **Verificações:** `node --check` passou nos 19 scripts JavaScript referenciados pelo `index.html`; `git diff --check` passou; simulação de importação na ordem dos 19 scripts e execução dos cinco callbacks `DOMContentLoaded` passou com DOM mínimo e stub do IndexedDB. O navegador bloqueou a abertura de `file://` pelo controle de URL desta sessão, portanto não foi possível confirmar o texto exato do console de uma execução visual real. Os arquivos `engine.geometry.js` e `engine.text.js` não aparecem no diff.
