"use client";

import type { FormEvent, ReactNode } from "react";
import { startTransition, useActionState } from "react";
import type { ManagerMutationAction } from "./manager-mutation-state";
import { INITIAL_MANAGER_MUTATION_STATE } from "./manager-mutation-state";
import styles from "./ManagerMutationForm.module.css";

export function ManagerMutationForm({
  action,
  className,
  children,
}: {
  action: ManagerMutationAction;
  className?: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(
    action,
    INITIAL_MANAGER_MUTATION_STATE,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <form className={className} onSubmit={submit} aria-busy={pending}>
      <fieldset className={styles.fields} disabled={pending}>
        {children}
      </fieldset>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? styles.error : styles.success}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
