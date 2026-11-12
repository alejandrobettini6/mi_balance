// Completá estos dos valores con el proyecto de Supabase.
// La clave anónima es pública: la seguridad está en las políticas de fila.
// No pongas acá la clave service_role.
export const supabaseUrl = "https://YOUR_PROJECT.supabase.co";
export const supabaseAnonKey = "YOUR_ANON_KEY";

export function isConfigured() {
  return (
    typeof supabaseUrl === "string" &&
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("YOUR_PROJECT") &&
    typeof supabaseAnonKey === "string" &&
    supabaseAnonKey.length > 20 &&
    !supabaseAnonKey.includes("YOUR_ANON_KEY")
  );
}
