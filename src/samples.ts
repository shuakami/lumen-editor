export interface SampleFile {
  id: string;
  name: string;
  dir?: string;
  hyper?: boolean;
  badge?: string;
  content: string;
}
 
const programCs = `using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
 
namespace Lumen.Demo;
 
/// <summary>
/// Entry point for the Lumen editor showcase.
/// Try typing: "cw", "for", "prop" — snippet completions kick in.
/// Hover over "Task", "Console" or "Select" for signature hints.
/// </summary>
public static class Program
{
    public static async Task Main(string[] args)
    {
        var stopwatch = Stopwatch.StartNew();
 
        var orders = Enumerable.Range(1, 1_000_000)
            .Select(i => new Order(Guid.NewGuid(), i, i * 1.5m))
            .Where(o => o.Amount > 100m)
            .OrderByDescending(o => o.Amount)
            .Take(10)
            .ToList();
 
        foreach (var order in orders)
        {
            Console.WriteLine($"#{order.Number,-8} {order.Amount,12:C}");
        }
 
        var pipeline = new OrderPipeline(maxConcurrency: Environment.ProcessorCount);
        var results = await pipeline.ProcessAsync(orders);
 
        Console.WriteLine($"Processed {results.Count} orders in {stopwatch.ElapsedMilliseconds} ms");
    }
}
 
public sealed record Order(Guid Id, int Number, decimal Amount)
{
    public bool IsLarge => Amount > 10_000m;
}
`;
 
const pipelineCs = `using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
 
namespace Lumen.Demo;
 
/// <summary>
/// A bounded-concurrency async pipeline built on SemaphoreSlim.
/// </summary>
public sealed class OrderPipeline : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate;
    private readonly ConcurrentBag<ProcessedOrder> _results = new();
    private long _processedCount;
 
    public OrderPipeline(int maxConcurrency)
    {
        if (maxConcurrency <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxConcurrency));
 
        _gate = new SemaphoreSlim(maxConcurrency, maxConcurrency);
    }
 
    public long ProcessedCount => Interlocked.Read(ref _processedCount);
 
    public async Task<IReadOnlyCollection<ProcessedOrder>> ProcessAsync(
        IEnumerable<Order> orders,
        CancellationToken cancellationToken = default)
    {
        var tasks = new List<Task>();
 
        foreach (var order in orders)
        {
            await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            tasks.Add(ProcessOneAsync(order, cancellationToken));
        }
 
        await Task.WhenAll(tasks).ConfigureAwait(false);
        return _results;
    }
 
    private async Task ProcessOneAsync(Order order, CancellationToken ct)
    {
        try
        {
            // Simulate I/O bound work
            await Task.Delay(Random.Shared.Next(1, 5), ct);
 
            var risk = order switch
            {
                { IsLarge: true } => RiskLevel.High,
                { Amount: > 1_000m } => RiskLevel.Medium,
                _ => RiskLevel.Low,
            };
 
            _results.Add(new ProcessedOrder(order, risk, DateTimeOffset.UtcNow));
            Interlocked.Increment(ref _processedCount);
        }
        finally
        {
            _gate.Release();
        }
    }
 
    public ValueTask DisposeAsync()
    {
        _gate.Dispose();
        return ValueTask.CompletedTask;
    }
}
 
public enum RiskLevel { Low, Medium, High }
 
public sealed record ProcessedOrder(Order Order, RiskLevel Risk, DateTimeOffset At);
`;
 
const spanCs = `using System;
using System.Buffers;
using System.Runtime.CompilerServices;
 
namespace Lumen.Demo;
 
/// <summary>
/// Zero-allocation CSV field scanner using ReadOnlySpan&lt;char&gt;.
/// TODO: handle quoted fields containing escaped quotes.
/// </summary>
public static class FastCsv
{
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static int CountFields(ReadOnlySpan<char> line)
    {
        var count = 1;
        var inQuotes = false;
 
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"') inQuotes = !inQuotes;
            else if (c == ',' && !inQuotes) count++;
        }
 
        return count;
    }
 
    public static bool TryGetField(
        ReadOnlySpan<char> line,
        int index,
        out ReadOnlySpan<char> field)
    {
        field = default;
        var current = 0;
        var start = 0;
 
        for (var i = 0; i <= line.Length; i++)
        {
            if (i == line.Length || line[i] == ',')
            {
                if (current == index)
                {
                    field = line.Slice(start, i - start).Trim();
                    return true;
                }
                current++;
                start = i + 1;
            }
        }
 
        return false;
    }
 
    public static string[] ParsePooled(string line)
    {
        var span = line.AsSpan();
        var fieldCount = CountFields(span);
        var rented = ArrayPool<string>.Shared.Rent(fieldCount);
 
        try
        {
            for (var i = 0; i < fieldCount; i++)
            {
                if (TryGetField(span, i, out var f))
                    rented[i] = f.ToString();
            }
 
            return rented.AsSpan(0, fieldCount).ToArray();
        }
        finally
        {
            ArrayPool<string>.Shared.Return(rented, clearArray: true);
        }
    }
}
`;
 
const arenaC = `#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
 
/*
 * arena.c — bump-pointer arena allocator.
 * Try typing: "for", "pf", "struct" — snippet completions kick in.
 */
 
#define ARENA_ALIGN 16
#define ARENA_DEFAULT_CAP (64 * 1024)
 
typedef struct Arena {
    uint8_t *base;
    size_t   cap;
    size_t   used;
    struct Arena *next;
} Arena;
 
static size_t align_up(size_t n, size_t a)
{
    return (n + a - 1) & ~(a - 1);
}
 
Arena *arena_create(size_t cap)
{
    if (cap == 0)
        cap = ARENA_DEFAULT_CAP;
 
    Arena *a = malloc(sizeof(Arena));
    if (!a)
        return NULL;
 
    a->base = malloc(cap);
    if (!a->base) {
        free(a);
        return NULL;
    }
 
    a->cap = cap;
    a->used = 0;
    a->next = NULL;
    return a;
}
 
void *arena_alloc(Arena *a, size_t size)
{
    size = align_up(size, ARENA_ALIGN);
 
    while (a->used + size > a->cap) {
        if (!a->next) {
            size_t cap = a->cap * 2 > size ? a->cap * 2 : size * 2;
            a->next = arena_create(cap);
            if (!a->next)
                return NULL;
        }
        a = a->next;
    }
 
    void *p = a->base + a->used;
    a->used += size;
    return p;
}
 
char *arena_strdup(Arena *a, const char *s)
{
    size_t len = strlen(s) + 1;
    char *p = arena_alloc(a, len);
    if (p)
        memcpy(p, s, len);
    return p;
}
 
void arena_destroy(Arena *a)
{
    while (a) {
        Arena *next = a->next;
        free(a->base);
        free(a);
        a = next;
    }
}
 
int main(void)
{
    Arena *a = arena_create(0);
    assert(a != NULL);
 
    for (int i = 0; i < 1000; i++) {
        char buf[64];
        snprintf(buf, sizeof buf, "string-%d", i);
        char *s = arena_strdup(a, buf);
        assert(s && strcmp(s, buf) == 0);
    }
 
    printf("arena ok: %zu bytes used\\n", a->used);
    arena_destroy(a);
    return 0;
}
`;
 
const signalTs = `type Listener<T> = (value: T) => void;
 
export interface Signal<T> {
  get(): T;
  set(next: T): void;
  subscribe(fn: Listener<T>): () => void;
}
 
export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();
 
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of listeners) fn(value);
    },
    subscribe(fn: Listener<T>) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
 
const counter = createSignal(0);
const unsubscribe = counter.subscribe((n) => console.log(\`count = \${n}\`));
 
for (let i = 1; i <= 3; i++) counter.set(i);
unsubscribe();
`;
 
const tokenizerPy = `"""A tiny expression tokenizer."""
 
from dataclasses import dataclass
from enum import Enum, auto
 
 
class TokenKind(Enum):
    NUMBER = auto()
    IDENT = auto()
    OP = auto()
    LPAREN = auto()
    RPAREN = auto()
 
 
@dataclass(frozen=True)
class Token:
    kind: TokenKind
    text: str
    pos: int
 
 
def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    while i < len(source):
        ch = source[i]
        if ch.isspace():
            i += 1
        elif ch.isdigit():
            start = i
            while i < len(source) and (source[i].isdigit() or source[i] == "."):
                i += 1
            tokens.append(Token(TokenKind.NUMBER, source[start:i], start))
        elif ch.isalpha() or ch == "_":
            start = i
            while i < len(source) and (source[i].isalnum() or source[i] == "_"):
                i += 1
            tokens.append(Token(TokenKind.IDENT, source[start:i], start))
        elif ch in "+-*/%":
            tokens.append(Token(TokenKind.OP, ch, i))
            i += 1
        elif ch == "(":
            tokens.append(Token(TokenKind.LPAREN, ch, i))
            i += 1
        elif ch == ")":
            tokens.append(Token(TokenKind.RPAREN, ch, i))
            i += 1
        else:
            raise ValueError(f"unexpected character {ch!r} at {i}")
    return tokens
 
 
if __name__ == "__main__":
    for token in tokenize("radius * (3.14159 + offset)"):
        print(f"{token.kind.name:<8} {token.text!r} @ {token.pos}")
`;
 
const mainRs = `use std::collections::HashMap;
 
#[derive(Debug, Clone, PartialEq)]
enum Json {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    Array(Vec<Json>),
    Object(HashMap<String, Json>),
}
 
impl Json {
    fn type_name(&self) -> &'static str {
        match self {
            Json::Null => "null",
            Json::Bool(_) => "bool",
            Json::Number(_) => "number",
            Json::Str(_) => "string",
            Json::Array(_) => "array",
            Json::Object(_) => "object",
        }
    }
}
 
fn main() {
    let mut obj = HashMap::new();
    obj.insert("name".to_string(), Json::Str("lumen".into()));
    obj.insert("lines".to_string(), Json::Number(10_000_000.0));
    obj.insert("fast".to_string(), Json::Bool(true));
 
    let doc = Json::Object(obj);
    println!("root is {}", doc.type_name());
 
    if let Json::Object(map) = &doc {
        for (key, value) in map {
            println!("  {key}: {}", value.type_name());
        }
    }
}
`;
 
const ciYaml = `name: ci
 
on:
  push:
    branches: [main]
  pull_request:
 
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
`;
 
const readmeMd = `# Lumen
 
一个浏览器里的高性能代码编辑器 demo。
 
## 特性
 
- **10,000,000 行**大文件流畅编辑（窗口化虚拟文档）
- Cursor Light / Dark 双主题，TextMate 级配色
- 语法高亮、补全、悬停、诊断、折叠、搜索
- 30+ 语言按扩展名自动识别
 
## 快速开始
 
\\\`\\\`\\\`bash
npm install
npm run dev
\\\`\\\`\\\`
`;
 
const dockerfileTxt = `FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
 
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
 
export const SAMPLE_FILES: SampleFile[] = [
  { id: "program", name: "Program.cs", dir: "src", content: programCs },
  { id: "pipeline", name: "OrderPipeline.cs", dir: "src", content: pipelineCs },
  { id: "fastcsv", name: "FastCsv.cs", dir: "src", content: spanCs },
  { id: "hyper", name: "Entities.g.cs", dir: "src", hyper: true, badge: "10M 行", content: "" },
  { id: "arena", name: "arena.c", dir: "native", content: arenaC },
  { id: "mainrs", name: "main.rs", dir: "native", content: mainRs },
  { id: "signal", name: "signal.ts", dir: "web", content: signalTs },
  { id: "tokenizer", name: "tokenizer.py", dir: "scripts", content: tokenizerPy },
  { id: "ci", name: "ci.yaml", dir: ".github", content: ciYaml },
  { id: "readme", name: "README.md", content: readmeMd },
  { id: "dockerfile", name: "Dockerfile", content: dockerfileTxt },
];
