/**
 * Valida formato de UUID (qualquer versão/variante), sem tocar o banco —
 * usado pelas rotas de API para devolver 404 ("não encontrado") em vez
 * de deixar um `id` malformado na URL virar 500: o Postgres rejeita a
 * sintaxe inválida antes da query rodar (`invalid input syntax for type
 * uuid`), e sem esta checagem prévia a rota devolvia "erro do servidor"
 * para o que na verdade é "não existe" (achado do coordenador,
 * 2026-08-25). Prefere validar o formato ANTES de chegar ao banco, para
 * não depender de capturar o código de erro do driver Postgres.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(v: string): boolean {
  return REGEX_UUID.test(v);
}
