"use client";

import { motion } from "framer-motion";

export function ComparisonSection() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(var(--color-accent-rgb),0.03), transparent)",
        }}
      />

      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Comparison
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            What your AI agent sees
          </h2>
          <p className="text-muted-foreground">
            Complex infra means more errors. Simple infra means shipping.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                Traditional Cloud
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                Complex
              </span>
            </div>
            <div className="p-4 font-mono text-xs space-y-1 text-neutral-500 max-h-64 overflow-y-auto">
              <div>$ aws iam create-role --role-name...</div>
              <div>$ aws iam attach-role-policy...</div>
              <div>$ aws ecr create-repository...</div>
              <div>$ aws ecr get-login-password...</div>
              <div>$ docker build -t...</div>
              <div>$ docker tag...</div>
              <div>$ docker push...</div>
              <div>$ aws ecs create-cluster...</div>
              <div>$ aws ecs register-task-definition...</div>
              <div>$ aws ecs create-service...</div>
              <div>$ aws elbv2 create-load-balancer...</div>
              <div>$ aws elbv2 create-target-group...</div>
              <div>$ aws acm request-certificate...</div>
              <div>$ aws route53 change-resource...</div>
              <div className="text-red-400">
                Error: AccessDenied: User is not authorized to perform...
              </div>
              <div className="text-neutral-600">... 32 more steps</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-neutral-900 border border-accent/30 rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <span className="text-sm text-accent">Frost</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                Simple
              </span>
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
              <div className="text-neutral-500">$ git push origin main</div>
              <div className="text-green-400">✓ Deployed to production</div>
              <div className="text-green-400">✓ SSL certificate issued</div>
              <div className="text-green-400">✓ Health check passed</div>
              <div className="mt-4 pt-4 border-t border-neutral-800">
                <span className="text-accent">→</span>{" "}
                <span className="text-blue-400">https://app.example.com</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-center text-muted-foreground text-sm mt-8"
        >
          AI agents work best with predictable, simple systems.
          <br />
          Frost is infrastructure designed for that.
        </motion.p>
      </div>
    </section>
  );
}
