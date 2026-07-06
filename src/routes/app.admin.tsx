import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus } from "lucide-react";
import { usuarios } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/app/admin")({ component: Admin });

const modulos = ["Comercial", "Projetos", "Equipamentos", "Webmail"] as const;
type Modulo = typeof modulos[number];
type Perm = { ver: boolean; editar: boolean };
type Matrix = Record<number, Record<Modulo, Perm>>;

const seed: Matrix = usuarios.reduce((acc, u) => {
  acc[u.id] = {
    "Comercial": { ver: u.perfil !== "Almoxarifado", editar: u.perfil === "Comercial" || u.perfil === "Administrador" },
    "Projetos": { ver: true, editar: u.perfil === "Projetos" || u.perfil === "Administrador" },
    "Equipamentos": { ver: true, editar: u.perfil === "Almoxarifado" || u.perfil === "Administrador" },
    "Webmail": { ver: true, editar: true },
  };
  return acc;
}, {} as Matrix);

function Admin() {
  const [matrix, setMatrix] = useState<Matrix>(seed);
  const toggle = (uid: number, mod: Modulo, key: keyof Perm) => {
    setMatrix(m => ({ ...m, [uid]: { ...m[uid], [mod]: { ...m[uid][mod], [key]: !m[uid][mod][key] } } }));
  };
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Usuários</h3>
            <p className="text-xs text-muted-foreground">Gerencie contas e perfis de acesso.</p>
          </div>
          <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Novo usuário</Button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Perfil</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.nome}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.perfil}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold text-[#213368]">Matriz de permissões</h3>
        <p className="mt-1 text-xs text-muted-foreground">Marque o nível de acesso de cada usuário por módulo.</p>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom">Usuário</TableHead>
                {modulos.map(m => <TableHead key={m} colSpan={2} className="text-center">{m}</TableHead>)}
              </TableRow>
              <TableRow>
                {modulos.map(m => (
                  <Fragment key={m}>
                    <TableHead className="text-center text-xs">Ver</TableHead>
                    <TableHead className="text-center text-xs">Editar</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.nome}<div className="text-xs font-normal text-muted-foreground">{u.perfil}</div></TableCell>
                  {modulos.map(m => (
                    <Fragment key={m}>
                      <TableCell className="text-center">
                        <Checkbox checked={matrix[u.id][m].ver} onCheckedChange={() => toggle(u.id, m, "ver")} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={matrix[u.id][m].editar} onCheckedChange={() => toggle(u.id, m, "editar")} />
                      </TableCell>
                    </Fragment>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
