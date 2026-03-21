import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

const features = [
  {
    title: "Videos",
    description: "Upload and manage your BJJ instructional videos",
    href: "/videos",
  },
  {
    title: "Knowledge Graph",
    description: "Explore techniques, positions, and their relationships",
    href: "/graph",
  },
  {
    title: "Chat",
    description: "Ask questions about your instructional library",
    href: "/chat",
  },
];

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Organize and query your BJJ instructional video library.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-primary">
                  Go to {feature.title.toLowerCase()} &rarr;
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
