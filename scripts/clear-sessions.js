
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing sessions...');
    try {
        const deleted = await prisma.session.deleteMany({});
        console.log(`Deleted ${deleted.count} sessions.`);
    } catch (e) {
        console.error('Error deleting sessions:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
