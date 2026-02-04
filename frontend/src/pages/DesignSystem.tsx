import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Terminal, CreditCard, Settings, User } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

export default function DesignSystem() {
    const { toast } = useToast();
    const [date, setDate] = React.useState<Date | undefined>(new Date());

    return (
        <div className="min-h-screen bg-background p-8 font-sans text-foreground">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="space-y-2">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Design System</h1>
                    <p className="text-xl text-muted-foreground">
                        A guide to the UI components and styles used in the application.
                    </p>
                </div>

                <Separator />

                {/* Typography */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Typography</h2>
                    <div className="grid gap-6">
                        <div className="grid gap-2">
                            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Heading 1</h1>
                            <h2 className="text-3xl font-semibold tracking-tight first:mt-0">Heading 2</h2>
                            <h3 className="text-2xl font-semibold tracking-tight">Heading 3</h3>
                            <h4 className="text-xl font-semibold tracking-tight">Heading 4</h4>
                            <p className="leading-7 [&:not(:first-child)]:mt-6">
                                The king, seeing how much happier his subjects were, realized the error of his ways and repealed the joke tax.
                            </p>
                            <p className="text-sm text-muted-foreground">Muted text for secondary information.</p>
                            <p className="text-sm font-medium leading-none">Small text with medium weight.</p>
                        </div>
                    </div>
                </section>

                <Separator />

                {/* Colors (Abstracted via Buttons/Badges for now, could act as color palette) */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Buttons</h2>
                    <div className="flex flex-wrap gap-4">
                        <Button>Default</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="destructive">Destructive</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="link">Link</Button>
                        <Button size="sm">Small</Button>
                        <Button size="lg">Large</Button>
                        <Button size="icon"><Settings className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                        <Button disabled>Disabled</Button>
                        <Button variant="secondary" disabled>Disabled Secondary</Button>
                    </div>
                </section>

                <Separator />

                {/* Form Elements */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Form Elements</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="grid gap-4">
                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input type="email" id="email" placeholder="Email" />
                            </div>
                            <div className="grid w-full gap-1.5">
                                <Label htmlFor="message">Message</Label>
                                <Textarea placeholder="Type your message here." id="message" />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="terms" />
                                <Label htmlFor="terms">Accept terms and conditions</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="airplane-mode" />
                                <Label htmlFor="airplane-mode">Airplane Mode</Label>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <RadioGroup defaultValue="option-one">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="option-one" id="option-one" />
                                    <Label htmlFor="option-one">Option One</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="option-two" id="option-two" />
                                    <Label htmlFor="option-two">Option Two</Label>
                                </div>
                            </RadioGroup>

                            <Select>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select a fruit" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="apple">Apple</SelectItem>
                                    <SelectItem value="banana">Banana</SelectItem>
                                    <SelectItem value="blueberry">Blueberry</SelectItem>
                                    <SelectItem value="grapes">Grapes</SelectItem>
                                    <SelectItem value="pineapple">Pineapple</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="w-[60%] space-y-2">
                                <Label>Slider</Label>
                                <Slider defaultValue={[50]} max={100} step={1} />
                            </div>
                        </div>
                    </div>
                </section>

                <Separator />

                {/* Cards & Content */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Cards & Containers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Card Title</CardTitle>
                                <CardDescription>Card Description</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>Card Content goes here.</p>
                            </CardContent>
                            <CardFooter>
                                <p>Card Footer</p>
                            </CardFooter>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <Avatar>
                                        <AvatarImage src="https://github.com/shadcn.png" />
                                        <AvatarFallback>CN</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <CardTitle>User Profile</CardTitle>
                                        <CardDescription>@shadcn</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-balance">This is an example of a card with an avatar in the header.</p>
                            </CardContent>
                        </Card>

                        <Card className="w-[350px]">
                            <CardHeader>
                                <CardTitle>Create project</CardTitle>
                                <CardDescription>Deploy your new project in one-click.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form>
                                    <div className="grid w-full items-center gap-4">
                                        <div className="flex flex-col space-y-1.5">
                                            <Label htmlFor="name">Name</Label>
                                            <Input id="name" placeholder="Name of your project" />
                                        </div>
                                        <div className="flex flex-col space-y-1.5">
                                            <Label htmlFor="framework">Framework</Label>
                                            <Select>
                                                <SelectTrigger id="framework">
                                                    <SelectValue placeholder="Select" />
                                                </SelectTrigger>
                                                <SelectContent position="popper">
                                                    <SelectItem value="next">Next.js</SelectItem>
                                                    <SelectItem value="sveltekit">SvelteKit</SelectItem>
                                                    <SelectItem value="astro">Astro</SelectItem>
                                                    <SelectItem value="nuxt">Nuxt.js</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </form>
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline">Cancel</Button>
                                <Button>Deploy</Button>
                            </CardFooter>
                        </Card>
                    </div>
                </section>

                <Separator />

                {/* Badges & Feedback */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Feedback & Status</h2>
                    <div className="flex flex-wrap gap-4">
                        <Badge>Default</Badge>
                        <Badge variant="secondary">Secondary</Badge>
                        <Badge variant="destructive">Destructive</Badge>
                        <Badge variant="outline">Outline</Badge>
                    </div>

                    <div className="space-y-4 max-w-xl">
                        <Alert>
                            <Terminal className="h-4 w-4" />
                            <AlertTitle>Heads up!</AlertTitle>
                            <AlertDescription>
                                You can add components to your app using the cli.
                            </AlertDescription>
                        </Alert>
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>
                                Your session has expired. Please log in again.
                            </AlertDescription>
                        </Alert>
                    </div>

                    <div className="space-y-2 w-[60%]">
                        <Label>Progress</Label>
                        <Progress value={33} />
                    </div>

                    <div className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                    </div>
                </section>

                <Separator />

                {/* Interactive Overlays */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Interactive & Overlays</h2>
                    <div className="flex flex-wrap gap-4">
                        {/* Dialog */}
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline">Open Dialog</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Are you absolutely sure?</DialogTitle>
                                    <DialogDescription>
                                        This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button type="submit">Confirm</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {/* Popover */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Tooltip */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline">Hover Me</Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Add to library</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Toast Trigger */}
                        <Button
                            variant="outline"
                            onClick={() => {
                                toast({
                                    title: "Scheduled: Catch up ",
                                    description: "Friday, February 10, 2023 at 5:57 PM",
                                    action: <Button variant="outline" size="sm">Undo</Button>
                                })
                            }}
                        >
                            Show Toast
                        </Button>
                    </div>
                </section>

                <Separator />

                {/* Navigation & Layout */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Navigation & Layout</h2>

                    <Tabs defaultValue="account" className="w-[400px]">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="account">Account</TabsTrigger>
                            <TabsTrigger value="password">Password</TabsTrigger>
                        </TabsList>
                        <TabsContent value="account">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Account</CardTitle>
                                    <CardDescription>
                                        Make changes to your account here. Click save when you're done.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="name">Name</Label>
                                        <Input id="name" defaultValue="Pedro Duarte" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="username">Username</Label>
                                        <Input id="username" defaultValue="@peduarte" />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button>Save changes</Button>
                                </CardFooter>
                            </Card>
                        </TabsContent>
                        <TabsContent value="password">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Password</CardTitle>
                                    <CardDescription>
                                        Change your password here. After saving, you'll be logged out.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="current">Current password</Label>
                                        <Input id="current" type="password" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="new">New password</Label>
                                        <Input id="new" type="password" />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button>Save password</Button>
                                </CardFooter>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    <div className="h-[200px] w-[350px] rounded-md border p-4">
                        <ScrollArea className="h-full w-full rounded-md border p-4">
                            Jokester began sneaking into the castle in the middle of the night and leaving
                            jokes all over the place: under the king's pillow, in his soup, even in the
                            royal toilet. The king was furious, but he couldn't seem to stop Jester. And
                            then, one day, the people of the kingdom discovered the jokes and they
                            started laughing. And then, one day, the people of the kingdom discovered
                            the jokes and they started laughing.
                        </ScrollArea>
                    </div>
                </section>

                <Separator />

                {/* Data Display */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Data Display</h2>
                    <div className="rounded-md border">
                        <Table>
                            <TableCaption>A list of your recent invoices.</TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Invoice</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">INV001</TableCell>
                                    <TableCell>Paid</TableCell>
                                    <TableCell>Credit Card</TableCell>
                                    <TableCell className="text-right">$250.00</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">INV002</TableCell>
                                    <TableCell>Pending</TableCell>
                                    <TableCell>PayPal</TableCell>
                                    <TableCell className="text-right">$150.00</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">INV003</TableCell>
                                    <TableCell>Unpaid</TableCell>
                                    <TableCell>Bank Transfer</TableCell>
                                    <TableCell className="text-right">$350.00</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </section>

                <Separator />

                {/* Command */}
                <section className="space-y-6">
                    <h2 className="text-3xl font-bold tracking-tight">Command Palette</h2>
                    <div className="rounded-xl border shadow-md max-w-[450px]">
                        <Command>
                            <CommandInput placeholder="Type a command or search..." />
                            <CommandList>
                                <CommandEmpty>No results found.</CommandEmpty>
                                <CommandGroup heading="Suggestions">
                                    <CommandItem>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        <span>Calendar</span>
                                    </CommandItem>
                                    <CommandItem>
                                        <User className="mr-2 h-4 w-4" />
                                        <span>Search Emoji</span>
                                    </CommandItem>
                                    <CommandItem>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        <span>Calculator</span>
                                    </CommandItem>
                                </CommandGroup>
                                <CommandGroup heading="Settings">
                                    <CommandItem>
                                        <User className="mr-2 h-4 w-4" />
                                        <span>Profile</span>
                                    </CommandItem>
                                    <CommandItem>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        <span>Billing</span>
                                    </CommandItem>
                                    <CommandItem>
                                        <Settings className="mr-2 h-4 w-4" />
                                        <span>Settings</span>
                                    </CommandItem>
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </div>
                </section>

                <div className="h-20"></div> {/* Spacer */}
            </div>
            <Toaster />
        </div>
    );
}
