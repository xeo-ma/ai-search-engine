export function ErrorState({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="error">{message}</p>;
}
