import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { PrismaClient, Prisma } from '@prisma/client';

interface DecodedToken {
  userId: string;
  email: string;
  role: string;
}

// @swagger
// /api/conversations:
//   get:
//     summary: Get all conversations
//     tags:
//       - Conversations
//     security:
//       - bearerAuth: []
//     parameters:
//       - in: query
//         name: userId
//         schema:
//           type: string
//         description: Filter by user ID
//     responses:
//       200:
//         description: List of conversations
//       401:
//         description: Unauthorized
//       500:
//         description: Server error
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await verifyToken(request) as DecodedToken | null;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    // If userId is provided in query, verify that the requesting user has access
    if (userId && decodedToken?.userId !== userId && decodedToken?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized to view these conversations' },
        { status: 403 }
      );
    }

    const conversations = await prisma.conversations.findMany({
      where: userId ? { userId } : {},
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// @swagger
// /api/conversations:
//   post:
//     summary: Create a new conversation
//     tags:
//       - Conversations
//     security:
//       - bearerAuth: []
//     requestBody:
//       required: true
//       content:
//         application/json:
//           schema:
//             type: object
//             properties:
//               userName:
//                 type: string
//               userPhone:
//                 type: string
//               initialMessage:
//                 type: string
//                 required: true
//     responses:
//       201:
//         description: Conversation created successfully
//       401:
//         description: Unauthorized
//       500:
//         description: Server error
export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    const decodedToken = await verifyToken(request) as DecodedToken | null;
    
    if (decodedToken) {
      userId = decodedToken.userId;
    }

    const { userName, userPhone, initialMessage } = await request.json();

    if (!initialMessage) {
      return NextResponse.json(
        { error: 'Initial message is required' },
        { status: 400 }
      );
    }

    // Create conversation and initial message in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conversation = await tx.conversations.create({
        data: {
          userId: userId || undefined,
          userName: userName || undefined,
          userPhone: userPhone || undefined
        }
      });

      const message = await tx.messages.create({
        data: {
          conversationId: conversation.id,
          content: initialMessage,
          isUser: true
        }
      });

      return { conversation, message };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
