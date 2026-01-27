import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import React from "react";
import { CodeBlock, InlineCode } from "@/app/docs/_components/code-block";
import { DocsLink } from "@/app/docs/_components/docs-link";
import {
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@/app/docs/_components/docs-table";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    pre: (props: ComponentPropsWithoutRef<"pre">) => {
      const { children } = props;
      const child = React.Children.toArray(children)[0];

      if (React.isValidElement(child)) {
        const childProps = child.props as {
          className?: string;
          children?: ReactNode;
        };
        return (
          <CodeBlock className={childProps.className}>
            {childProps.children}
          </CodeBlock>
        );
      }

      return <CodeBlock>{children}</CodeBlock>;
    },
    code({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) {
      if (className) {
        return <code className={className}>{children}</code>;
      }
      return <InlineCode>{children}</InlineCode>;
    },
    a({ href, children }: { href?: string; children?: ReactNode }) {
      return <DocsLink href={href}>{children}</DocsLink>;
    },
    table({ children }: { children?: ReactNode }) {
      return <Table>{children}</Table>;
    },
    thead({ children }: { children?: ReactNode }) {
      return <Thead>{children}</Thead>;
    },
    tbody({ children }: { children?: ReactNode }) {
      return <Tbody>{children}</Tbody>;
    },
    tr({ children }: { children?: ReactNode }) {
      return <Tr>{children}</Tr>;
    },
    th({ children }: { children?: ReactNode }) {
      return <Th>{children}</Th>;
    },
    td({ children }: { children?: ReactNode }) {
      return <Td>{children}</Td>;
    },
  };
}
