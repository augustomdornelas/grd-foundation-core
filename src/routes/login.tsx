import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/brand/Logo";
import { GridMotif } from "@/components/brand/GridMotif";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: user.trim(),
      password: password,
    });
    if (error) {
      setError("Usuário ou senha incorretos.");
      setLoading(false);
    } else {
      navigate({ to: "/app" });
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#213368] p-10 text-white md:flex md:flex-col md:justify-between">
        <div className="grid-motif absolute inset-0" />
        <GridMotif className="absolute -right-10 top-20" opacity={0.2} />
        <GridMotif className="absolute -left-16 bottom-0" opacity={0.15} />
        <div className="relative"><Logo variant="light" /></div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-extrabold text-white lg:text-4xl">Bem-vindo à área do colaborador</h1>
          <p className="mt-4 text-white/70">Acesse os módulos do Grupo GRD: comercial, projetos, equipamentos, webmail e administração.</p>
        </div>
        <div className="relative text-xs text-white/50">© {new Date().getFullYear()} Grupo GRD</div>
      </div>
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden"><Logo /></div>
          <h2 className="text-2xl font-extrabold">Entrar</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use seu usuário corporativo para acessar o portal.</p>
          <p className="mt-1 text-xs text-muted-foreground">Acesso exclusivo para equipe autorizada.</p>
          <form onSubmit={submit} className="mt-8 grid gap-4" noValidate>
            <div className="grid gap-2">
              <label htmlFor="user" className="text-sm font-medium">Usuário ou e-mail</label>
              <Input
                id="user"
                type="email"
                autoComplete="username"
                placeholder="seu.nome@grupogrd.com.br"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                style={{ textTransform: "none" }}
              />

            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">Senha</label>
                <a href="#" className="text-xs font-medium text-[#213368] hover:text-[#F37032]">Esqueci a senha</a>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ textTransform: "none" }}
              />

            </div>
            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            <Button disabled={loading} className="mt-2 bg-[#F37032] text-white hover:bg-[#ff8850]">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">← Voltar ao site</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
