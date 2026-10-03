import type { HeaderEntry } from "@/lib/bindings";

export function HeadersTable({ headers }: { headers: HeaderEntry[] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {headers.map((h, i) => (
          <tr key={`${h.name}-${i}`} className="border-b align-top last:border-0">
            <td className="w-1/3 px-3 py-1.5 font-mono font-semibold break-all">{h.name}</td>
            <td className="px-3 py-1.5 font-mono break-all">{h.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
