import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Sparkles, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ListingGenerator() {
  const navigate = useNavigate();
  const [productName, setProductName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<{
    title: string;
    bullets: string[];
    description: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!productName) return;
    
    setIsGenerating(true);
    // Simulate AI generation
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    setGeneratedContent({
      title: `${productName} - Premium Quality | Best Seller | Fast Shipping`,
      bullets: [
        `✓ HIGH QUALITY MATERIALS - Made with premium grade materials for long-lasting durability`,
        `✓ EASY TO USE - Simple setup and intuitive design for hassle-free experience`,
        `✓ SATISFACTION GUARANTEED - 100% money-back guarantee if you're not completely satisfied`,
        `✓ PERFECT GIFT - Great gift idea for friends, family, and loved ones`,
        `✓ FAST SHIPPING - Ships within 24 hours with Prime eligible delivery`,
      ],
      description: `Introducing the ${productName} - your ultimate solution for quality and convenience. ${keywords ? `Perfect for ${keywords}.` : ""} Our product stands out from the competition with its superior craftsmanship and attention to detail. Whether you're a first-time buyer or a returning customer, you'll appreciate the value and quality we deliver with every order. Order now and experience the difference!`,
    });
    setIsGenerating(false);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Layout>
      <div className="container py-8">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Listing Content Generator</h1>
          <p className="mt-2 text-muted-foreground">
            Generate optimized Amazon product listings with AI
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
              <CardDescription>
                Enter your product information to generate listing content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-name">Product Name *</Label>
                <Input
                  id="product-name"
                  placeholder="e.g., Stainless Steel Water Bottle"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords">Target Keywords</Label>
                <Textarea
                  id="keywords"
                  placeholder="e.g., eco-friendly, BPA-free, gym, travel"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={!productName || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Listing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Output Section */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Content</CardTitle>
              <CardDescription>
                {generatedContent
                  ? "Click to copy any section"
                  : "Your generated listing will appear here"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {generatedContent ? (
                <>
                  {/* Title */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Product Title</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(generatedContent.title, "title")}
                      >
                        {copied === "title" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="rounded-md bg-muted p-3 text-sm">
                      {generatedContent.title}
                    </div>
                  </div>

                  {/* Bullets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Bullet Points</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopy(generatedContent.bullets.join("\n"), "bullets")
                        }
                      >
                        {copied === "bullets" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                      {generatedContent.bullets.map((bullet, i) => (
                        <p key={i}>{bullet}</p>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Product Description</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopy(generatedContent.description, "description")
                        }
                      >
                        {copied === "description" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="rounded-md bg-muted p-3 text-sm">
                      {generatedContent.description}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  Enter product details and click generate
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
