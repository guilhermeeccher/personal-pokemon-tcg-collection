/*
 * Tipos do React canary que o Next 16.3.2 embute no App Router.
 *
 * Em tempo de execução, `import { ViewTransition } from "react"` funciona: o
 * App Router não usa o React do `node_modules` (19.2.x), e sim o canary que
 * o Next traz compilado, onde o componente existe sem flag. Os tipos vêm do
 * `@types/react` do projeto, que só declara `ViewTransition` e
 * `addTransitionType` em `canary.d.ts`.
 *
 * Hoje esses tipos também chegam por tabela: os tipos do próprio Next
 * (`next/dist/types.d.ts`, puxados por qualquer import de `next`) referenciam
 * `react/experimental`, que inclui o canary — conferido no 16.3.2, com e sem
 * o `next-env.d.ts`. Essa referência é detalhe interno do Next e pode sumir
 * numa atualização; esta linha deixa a v2 depender do que ela mesma declara.
 * Ela acrescenta declarações; não muda nenhuma que já existia.
 *
 * Atualizar o Next pode trocar o canary embutido: toda atualização revê as
 * transições da v2 (`transicao-vista.tsx`).
 */
/// <reference types="react/canary" />
