export function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border border-cyan-500 border-t-transparent" />
    </div>
  );
}
