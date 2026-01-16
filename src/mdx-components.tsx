import type { MDXComponents } from "mdx/types";
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
    pre: (props) => {
      const { children } = props;
      const child = React.Children.toArray(children)[0];

      if (React.isValidElement(child)) {
        const childProps = child.props as {
          className?: string;
          children?: React.ReactNode;
        };
        return (
          <CodeBlock className={childProps.className}>
            {childProps.children}
          </CodeBlock>
        );
      }

      return <CodeBlock>{children}</CodeBlock>;
    },
    code: ({ children, className }) => {
      if (className) {
        return <code className={className}>{children}</code>;
      }
      return <InlineCode>{children}</InlineCode>;
    },
    a: ({ href, children }) => <DocsLink href={href}>{children}</DocsLink>,
    table: ({ children }) => <Table>{children}</Table>,
    thead: ({ children }) => <Thead>{children}</Thead>,
    tbody: ({ children }) => <Tbody>{children}</Tbody>,
    tr: ({ children }) => <Tr>{children}</Tr>,
    th: ({ children }) => <Th>{children}</Th>,
    td: ({ children }) => <Td>{children}</Td>,
  };
}
