import { Alert } from "@mantine/core";
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <Alert color="red" role="alert" mb="xs">
      {error}
    </Alert>
  ) : null;
}
