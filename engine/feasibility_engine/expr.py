"""Safe evaluator for BOQ quantity/rate formulas such as "=BasePerim*(ExcDepth+0.5)".

Only numbers, variable names and + - * / ( ) are allowed. No eval().
"""

import ast
from collections.abc import Callable, Mapping

_BINOPS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
}


class FormulaError(ValueError):
    pass


def _eval(node: ast.AST, env: Mapping[str, float]) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in env:
            raise FormulaError(f"unknown variable: {node.id}")
        return float(env[node.id])
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        return _BINOPS[type(node.op)](_eval(node.left, env), _eval(node.right, env))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand, env)
        return -v if isinstance(node.op, ast.USub) else v
    raise FormulaError(f"unsupported expression: {ast.dump(node)}")


def evaluate(value: float | str, env: Mapping[str, float]) -> float:
    """A number is returned as is; a string starting with '=' is evaluated against env."""
    if isinstance(value, (int, float)):
        return float(value)
    text = value.strip()
    if not text.startswith("="):
        try:
            return float(text)
        except ValueError as exc:
            raise FormulaError(f"formula must start with '=': {value!r}") from exc
    try:
        tree = ast.parse(text[1:], mode="eval")
    except SyntaxError as exc:
        raise FormulaError(f"invalid formula: {value!r}") from exc
    return _eval(tree, env)
