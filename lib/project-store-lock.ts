let projectStoreChain: Promise<unknown> = Promise.resolve();

export function withProjectStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = projectStoreChain.then(operation, operation);
  projectStoreChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
