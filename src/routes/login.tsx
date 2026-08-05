import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({ component: LoginRedirect });

function LoginRedirect() {
  const nav = useNavigate();
  useEffect(() => { nav({ to: "/", replace: true }); }, [nav]);
  return null;
}
