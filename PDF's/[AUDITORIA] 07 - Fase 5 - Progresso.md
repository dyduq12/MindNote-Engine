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
