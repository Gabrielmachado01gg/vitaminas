# Minhas vitaminas

App de checklist diário de vitaminas e remédio. Funciona como app no iPhone e offline.

## Publicar de graça (GitHub Pages)

1. Crie um repositório novo no GitHub (ex: `vitaminas`), público.
2. Envie todos os arquivos desta pasta para a raiz do repositório (index.html, style.css, app.js, manifest.json, sw.js, pasta icons).
3. No repositório, abra Settings, depois Pages. Em Source escolha "Deploy from a branch", branch `main`, pasta `/ (root)` e salve.
4. Em 1 ou 2 minutos o link aparece: `https://SEU-USUARIO.github.io/vitaminas/`.

Alternativa mais rápida: arraste a pasta em https://app.netlify.com/drop e copie o link gerado.

## Instalar no iPhone (manda esse passo para ela)

1. Abrir o link no Safari (precisa ser o Safari).
2. Tocar no botão Compartilhar (quadrado com seta para cima).
3. Tocar em "Adicionar à Tela de Início" e depois em "Adicionar".
4. Abrir pelo ícone novo: o app abre em tela cheia, sem barra do navegador.

## Observações

- Os dados ficam guardados só no celular dela. Se ela apagar o app ou limpar os dados do Safari, o histórico some.
- Os horários iniciais são sugestões. Ela pode mudar tudo em Ajustes.
- Se você alterar algum arquivo depois de publicar, aumente o número em `CACHE` no `sw.js` (ex: `vitaminas-v2`) para o celular baixar a versão nova.
