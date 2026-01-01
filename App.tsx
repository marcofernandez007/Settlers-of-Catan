
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, Hex, ResourceType, TerrainType, Intersection, Edge, GamePhase, DevCardType, DevCard, PortType, ChatMessage } from './types';
import { TERRAIN_DATA, TOKEN_VALUES, HEX_SIZE, BUILDING_COSTS, COLORS } from './constants';
import { getStrategicAdvice } from './services/gemini';

const SOUNDS = {
  DICE: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3', // Soft wooden percussion
  BUILD: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', // Gentle clean chime
  CARD: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', // Light melodic chime
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3', // Uplifting harp flourish
  TRADE: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3', // Delicate double chime
  MESSAGE: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3', // Minimal subtle notification
};

const getHexCoords = (q: number, r: number) => {
  // Explicitly cast HEX_SIZE to number to avoid arithmetic inference issues
  const x = Number(HEX_SIZE) * (1.5 * q);
  const y = Number(HEX_SIZE) * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
};

const INITIAL_RESOURCES: Record<ResourceType, number> = {
  WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0, DESERT: 0
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [advice, setAdvice] = useState<string>("Welcome, Explorer! Roll the dice to gather resources and start building your empire.");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'LOG' | 'CHAT'>('LOG');
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  // Mobile UI States
  const [showMenu, setShowMenu] = useState(false);
  
  // Animation state
  const [isRolling, setIsRolling] = useState(false);
  const [tempDice, setTempDice] = useState<[number, number]>([1, 1]);

  // Trading States
  const [tradeMode, setTradeMode] = useState<'MARITIME' | 'PLAYER'>('MARITIME');
  const [tradeGive, setTradeGive] = useState<ResourceType | null>(null);
  const [tradeGet, setTradeGet] = useState<ResourceType | null>(null);
  
  const [targetPlayerId, setTargetPlayerId] = useState<number | null>(null);
  const [p2pOffer, setP2pOffer] = useState<Record<string, number>>({ WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0 });
  const [p2pRequest, setP2pRequest] = useState<Record<string, number>>({ WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0 });

  const playSound = useCallback((url: string) => {
    const audio = new Audio(url);
    audio.volume = 0.3;
    audio.play().catch(e => console.debug('Audio play failed:', e));
  }, []);

  const initGame = () => {
    const players: Player[] = [
      { id: 0, name: 'Red Player', color: COLORS[0], resources: { ...INITIAL_RESOURCES, WOOD: 4, BRICK: 4, SHEEP: 2, WHEAT: 2 }, victoryPoints: 0, devCards: [], knightCount: 0 },
      { id: 1, name: 'Blue Player', color: COLORS[1], resources: { ...INITIAL_RESOURCES, WOOD: 4, BRICK: 4, SHEEP: 2, WHEAT: 2 }, victoryPoints: 0, devCards: [], knightCount: 0 },
    ];

    const layouts = [
      { q: 0, r: 0 },
      { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 },
      { q: 2, r: -2 }, { q: 2, r: -1 }, { q: 2, r: 0 }, { q: 1, r: 1 }, { q: 0, r: 2 }, { q: -1, r: 2 }, { q: -2, r: 2 }, { q: -2, r: 1 }, { q: -2, r: 0 }, { q: -1, r: -1 }, { q: 0, r: -2 }, { q: 1, r: -2 }
    ];

    const terrains: (keyof typeof TERRAIN_DATA)[] = [
      'FOREST', 'FOREST', 'FOREST', 'FOREST',
      'PASTURE', 'PASTURE', 'PASTURE', 'PASTURE',
      'FIELDS', 'FIELDS', 'FIELDS', 'FIELDS',
      'HILLS', 'HILLS', 'HILLS',
      'MOUNTAINS', 'MOUNTAINS', 'MOUNTAINS',
      'DESERT'
    ].sort(() => Math.random() - 0.5) as any;

    const tokens = [...TOKEN_VALUES].sort(() => Math.random() - 0.5);
    let tokenIdx = 0;

    let desertHexId = "";
    const board: Hex[] = layouts.map((l, i) => {
      const terrain = terrains[i];
      const isDesert = terrain === 'DESERT';
      const id = `hex-${l.q}-${l.r}`;
      if (isDesert) desertHexId = id;
      return {
        id,
        q: l.q,
        r: l.r,
        terrain,
        resource: TERRAIN_DATA[terrain].resource,
        tokenValue: isDesert ? null : tokens[tokenIdx++]
      };
    });

    const intersections: Record<string, Intersection> = {};
    const edges: Record<string, Edge> = {};

    board.forEach(h => {
      const { x, y } = getHexCoords(h.q, h.r);
      const hexIntersections: string[] = [];

      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i);
        // Explicit number conversion for robust arithmetic
        const ix = Number(x) + Number(HEX_SIZE) * Math.cos(angle);
        const iy = Number(y) + Number(HEX_SIZE) * Math.sin(angle);
        const id = `int-${Math.round(ix)}-${Math.round(iy)}`;
        if (!intersections[id]) {
          intersections[id] = { id, coords: { x: ix, y: iy }, owner: null, type: null, adjacentHexIds: [] };
        }
        intersections[id].adjacentHexIds.push(h.id);
        hexIntersections.push(id);
      }

      for (let i = 0; i < 6; i++) {
        const id1 = hexIntersections[i];
        const id2 = hexIntersections[(i + 1) % 6];
        const edgeId = [id1, id2].sort().join('--');
        if (!edges[edgeId]) {
          edges[edgeId] = { id: edgeId, owner: null, adjacentIntersections: [id1, id2] };
        }
      }
    });

    const peripheralIntersections = Object.values(intersections).filter(int => int.adjacentHexIds.length < 3);
    const portTypes: PortType[] = ['3:1', 'WOOD', 'BRICK', 'SHEEP', 'WHEAT', 'ORE', '3:1', '3:1', '3:1'];
    peripheralIntersections.sort((a, b) => Math.atan2(a.coords.y, a.coords.x) - Math.atan2(b.coords.y, b.coords.x));
    
    const portStep = Math.floor(peripheralIntersections.length / portTypes.length);
    portTypes.forEach((type, i) => {
      const target = peripheralIntersections[i * portStep];
      if (target) {
        intersections[target.id].port = type;
      }
    });

    const deck: DevCardType[] = [
      ...Array(14).fill('KNIGHT'),
      ...Array(5).fill('VICTORY_POINT'),
      ...Array(2).fill('MONOPOLY'),
      ...Array(2).fill('ROAD_BUILDING'),
      ...Array(2).fill('YEAR_OF_PLENTY')
    ].sort(() => Math.random() - 0.5);

    setGameState({
      players,
      currentPlayerIndex: 0,
      board,
      intersections,
      edges,
      phase: 'BUILDING',
      diceRoll: null,
      logs: ["Catan beckons! Red starts the journey."],
      chatMessages: [],
      longestRoadOwnerId: null,
      longestRoadLength: 4,
      largestArmyOwnerId: null,
      devCardDeck: deck,
      robberHexId: desertHexId,
    });
  };

  useEffect(() => {
    initGame();
  }, []);

  useEffect(() => {
    if (activeTab === 'CHAT' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [gameState?.chatMessages, activeTab]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!gameState || !chatInput.trim()) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      text: chatInput.trim(),
      timestamp: Date.now()
    };

    setGameState(prev => prev ? ({
      ...prev,
      chatMessages: [...prev.chatMessages, newMessage]
    }) : null);
    
    setChatInput('');
    playSound(SOUNDS.MESSAGE);
  };

  const getBestRateForResource = (player: Player, resource: ResourceType): number => {
    if (!gameState) return 4;
    const playerIntersections = (Object.values(gameState.intersections) as Intersection[]).filter(int => int.owner === player.id);
    const ownedPorts = playerIntersections.map(int => int.port).filter(Boolean) as PortType[];

    if (ownedPorts.includes(resource as any)) return 2;
    if (ownedPorts.includes('3:1')) return 3;
    return 4;
  };

  const calculateLongestRoad = (playerId: number, edges: Record<string, Edge>, intersections: Record<string, Intersection>): number => {
    const playerEdges = Object.values(edges).filter(e => e.owner === playerId);
    if (playerEdges.length === 0) return 0;

    const adj: Record<string, string[]> = {};
    playerEdges.forEach(e => {
      const [v1, v2] = e.adjacentIntersections;
      if (!adj[v1]) adj[v1] = [];
      if (!adj[v2]) adj[v2] = [];
      adj[v1].push(v2);
      adj[v2].push(v1);
    });

    let maxPath = 0;
    const dfs = (curr: string, visitedEdges: Set<string>, currentLen: number) => {
      maxPath = Math.max(maxPath, currentLen);
      const int = intersections[curr];
      if (int && int.owner !== null && int.owner !== playerId) return;
      if (!adj[curr]) return;
      for (const next of adj[curr]) {
        const edgeId = [curr, next].sort().join('--');
        if (!visitedEdges.has(edgeId)) {
          visitedEdges.add(edgeId);
          dfs(next, visitedEdges, currentLen + 1);
          visitedEdges.delete(edgeId);
        }
      }
    };

    Object.keys(adj).forEach(startNode => {
      dfs(startNode, new Set(), 0);
    });
    return maxPath;
  };

  const updateSpecialAwards = (currentState: GameState) => {
    let roadOwner = currentState.longestRoadOwnerId;
    let roadMax = currentState.longestRoadLength || 4; 
    let armyOwner = currentState.largestArmyOwnerId;
    let armyMax = (armyOwner !== null ? currentState.players[armyOwner].knightCount : 2); 
    
    const newPlayers = JSON.parse(JSON.stringify(currentState.players));
    const newLogs = [...currentState.logs];

    currentState.players.forEach(p => {
      const len = calculateLongestRoad(p.id, currentState.edges, currentState.intersections);
      if (len > roadMax) {
        if (roadOwner !== null && roadOwner !== p.id) {
          newPlayers[roadOwner].victoryPoints -= 2;
          newLogs.push(`${newPlayers[roadOwner].name} lost the Longest Road!`);
        }
        if (roadOwner !== p.id) {
          newPlayers[p.id].victoryPoints += 2;
          newLogs.push(`${p.name} claimed the Longest Road with ${len} segments!`);
        }
        roadOwner = p.id;
        roadMax = len;
      } else if (p.id === roadOwner) {
        roadMax = len;
      }
    });

    currentState.players.forEach(p => {
      if (p.knightCount > armyMax) {
        if (armyOwner !== null && armyOwner !== p.id) {
          newPlayers[armyOwner].victoryPoints -= 2;
          newLogs.push(`${newPlayers[armyOwner].name} lost the Largest Army!`);
        }
        if (armyOwner !== p.id) {
          newPlayers[p.id].victoryPoints += 2;
          newLogs.push(`${p.name} claimed the Largest Army with ${p.knightCount} knights!`);
        }
        armyOwner = p.id;
        armyMax = p.knightCount;
      }
    });

    return { 
      ...currentState, 
      players: newPlayers, 
      longestRoadOwnerId: roadOwner, 
      longestRoadLength: roadMax, 
      largestArmyOwnerId: armyOwner,
      logs: newLogs.slice(-10)
    };
  };

  const checkVictory = (players: Player[]) => {
    const winner = players.find(p => p.victoryPoints >= 10);
    if (winner && gameState && gameState.phase !== 'WON') {
      playSound(SOUNDS.WIN);
      setGameState(prev => prev ? ({ ...prev, players, phase: 'WON', logs: [...prev.logs, `${winner.name} IS THE MASTER OF CATAN!`] }) : null);
    }
  };

  const buyDevCard = () => {
    if (!gameState || gameState.phase === 'WON') return;
    const player = gameState.players[gameState.currentPlayerIndex];
    const cost = BUILDING_COSTS.DEV_CARD;

    if (!canAfford(player, cost)) {
      alert("Need 1 Sheep, 1 Wheat, 1 Ore!");
      return;
    }

    if (gameState.devCardDeck.length === 0) {
      alert("Deck empty.");
      return;
    }

    playSound(SOUNDS.CARD);

    const newDeck = [...gameState.devCardDeck];
    const cardType = newDeck.pop()!;
    const newCard: DevCard = {
      id: `dev-${Date.now()}-${Math.random()}`,
      type: cardType,
      played: false,
      boughtThisTurn: true
    };

    const newPlayers = [...gameState.players];
    newPlayers[player.id].resources = spendResources(player, cost);
    newPlayers[player.id].devCards.push(newCard);
    
    if (cardType === 'VICTORY_POINT') {
      newPlayers[player.id].victoryPoints += 1;
      newCard.played = true;
    }

    let nextState = { ...gameState, players: newPlayers, devCardDeck: newDeck, logs: [...gameState.logs, `${player.name} bought a Development Card.`].slice(-5) };
    setGameState(nextState);
    checkVictory(nextState.players);
  };

  const playDevCard = (cardId: string) => {
    if (!gameState || gameState.phase === 'WON') return;
    const player = gameState.players[gameState.currentPlayerIndex];
    const cardIdx = player.devCards.findIndex(c => c.id === cardId);
    const card = player.devCards[cardIdx];

    if (!card || card.played) return;
    if (card.boughtThisTurn && card.type !== 'VICTORY_POINT') {
      alert("Wait until next turn to play this!");
      return;
    }

    const newPlayers = [...gameState.players];
    const logs = [...gameState.logs];

    switch (card.type) {
      case 'KNIGHT':
        newPlayers[player.id].knightCount += 1;
        logs.push(`${player.name} played a Knight! Moving the Robber.`);
        setGameState({ ...gameState, players: newPlayers, phase: 'MOVING_ROBBER', logs: logs.slice(-5) });
        return; 
      case 'MONOPOLY':
        const res = prompt("Declare Monopoly on:")?.toUpperCase() as ResourceType;
        if (!INITIAL_RESOURCES.hasOwnProperty(res) || res === 'DESERT') return;
        let stolen = 0;
        newPlayers.forEach((p, idx) => {
          if (idx !== player.id) {
            stolen += p.resources[res];
            p.resources[res] = 0;
          }
        });
        newPlayers[player.id].resources[res] += stolen;
        logs.push(`${player.name} monopolized ${res} (+${stolen})!`);
        break;
      case 'YEAR_OF_PLENTY':
        const pool: ResourceType[] = ['WOOD', 'BRICK', 'SHEEP', 'WHEAT', 'ORE'];
        const r1 = pool[Math.floor(Math.random() * pool.length)];
        const r2 = pool[Math.floor(Math.random() * pool.length)];
        newPlayers[player.id].resources[r1] += 1;
        newPlayers[player.id].resources[r2] += 1;
        logs.push(`${player.name} used Year of Plenty.`);
        break;
      case 'ROAD_BUILDING':
        newPlayers[player.id].resources.WOOD += 2;
        newPlayers[player.id].resources.BRICK += 2;
        logs.push(`${player.name} used Road Building.`);
        break;
      default:
        return;
    }

    newPlayers[player.id].devCards[cardIdx].played = true;
    let nextState = updateSpecialAwards({ ...gameState, players: newPlayers, logs: logs.slice(-5) });
    setGameState(nextState);
    checkVictory(nextState.players);
  };

  const handleRollDice = () => {
    if (!gameState || gameState.phase === 'WON' || isRolling) return;
    
    setIsRolling(true);
    playSound(SOUNDS.DICE);

    const rollInterval = setInterval(() => {
      setTempDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }, 50);

    setTimeout(() => {
      clearInterval(rollInterval);
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const sum = d1 + d2;
      setIsRolling(false);

      if (sum === 7) {
        setGameState({
          ...gameState,
          diceRoll: [d1, d2],
          phase: 'MOVING_ROBBER',
          logs: [...gameState.logs, `${gameState.players[gameState.currentPlayerIndex].name} rolled a 7! Place the Robber.`].slice(-5)
        });
        return;
      }

      const newPlayers = [...gameState.players];
      const logs = [`${gameState.players[gameState.currentPlayerIndex].name} rolled a ${sum}.`];

      gameState.board.forEach(hex => {
        if (hex.tokenValue === sum && hex.id !== gameState.robberHexId) {
          (Object.values(gameState.intersections) as Intersection[]).forEach((int) => {
            if (int.owner !== null && int.adjacentHexIds.includes(hex.id)) {
              const amount = int.type === 'CITY' ? 2 : 1;
              newPlayers[int.owner].resources[hex.resource] += amount;
              logs.push(`${newPlayers[int.owner].name} collected ${amount} ${hex.resource}.`);
            }
          });
        }
      });

      setGameState({
        ...gameState,
        players: newPlayers,
        diceRoll: [d1, d2],
        phase: 'BUILDING',
        logs: [...gameState.logs, ...logs].slice(-5)
      });
    }, 1200);
  };

  const moveRobber = (hexId: string) => {
    if (!gameState || gameState.phase !== 'MOVING_ROBBER') return;
    if (hexId === gameState.robberHexId) {
      alert("The Robber must be moved to a different hex!");
      return;
    }

    const victims = Array.from(new Set(
      (Object.values(gameState.intersections) as Intersection[])
        .filter(int => int.owner !== null && int.owner !== gameState.currentPlayerIndex && int.adjacentHexIds.includes(hexId))
        .map(int => int.owner!)
        .filter(id => {
          const p = gameState.players[id];
          return (Object.values(p.resources) as number[]).reduce((a: number, b: number) => a + b, 0) > 0;
        })
    ));

    if (victims.length === 0) {
      setGameState({
        ...gameState,
        robberHexId: hexId,
        phase: 'BUILDING',
        logs: [...gameState.logs, "Robber moved. No one to steal from."].slice(-5)
      });
    } else if (victims.length === 1) {
      handleSteal(victims[0], hexId);
    } else {
      setGameState({
        ...gameState,
        robberHexId: hexId,
        phase: 'STEALING',
        stealingCandidates: victims,
        logs: [...gameState.logs, "Choose a player to steal from."].slice(-5)
      });
    }
  };

  const handleSteal = (victimId: number, newHexId?: string) => {
    if (!gameState) return;
    const robberHexId = newHexId || gameState.robberHexId;
    const newPlayers = JSON.parse(JSON.stringify(gameState.players));
    const victim = newPlayers[victimId];
    const thief = newPlayers[gameState.currentPlayerIndex];

    const resourcesAvailable = (Object.entries(victim.resources) as [string, number][])
      .filter(([res, amt]) => amt > 0 && res !== 'DESERT')
      .flatMap(([res, amt]) => Array(amt).fill(res));

    if (resourcesAvailable.length > 0) {
      const stolenRes = resourcesAvailable[Math.floor(Math.random() * resourcesAvailable.length)] as ResourceType;
      victim.resources[stolenRes] -= 1;
      thief.resources[stolenRes] += 1;
      setGameState({
        ...gameState,
        players: newPlayers,
        robberHexId,
        phase: 'BUILDING',
        logs: [...gameState.logs, `${thief.name} stole from ${victim.name}.`].slice(-5)
      });
    } else {
      setGameState({
        ...gameState,
        robberHexId,
        phase: 'BUILDING',
        logs: [...gameState.logs, "Robber moved, but victim had no resources."].slice(-5)
      });
    }
  };

  const handleEndTurn = () => {
    if (!gameState || gameState.phase === 'WON') return;
    const nextIdx = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    const newPlayers = [...gameState.players];
    newPlayers[gameState.currentPlayerIndex].devCards = newPlayers[gameState.currentPlayerIndex].devCards.map(c => ({...c, boughtThisTurn: false}));

    setGameState({
      ...gameState,
      players: newPlayers,
      currentPlayerIndex: nextIdx,
      phase: 'ROLLING',
      diceRoll: null,
      logs: [...gameState.logs, `Turn: ${gameState.players[nextIdx].name}.`].slice(-5)
    });
  };

  const executeTrade = () => {
    if (!gameState) return;
    
    if (tradeMode === 'MARITIME') {
      if (!tradeGive || !tradeGet) return;
      const rate = getBestRateForResource(currentPlayer, tradeGive);
      if (currentPlayer.resources[tradeGive] < rate) {
        alert(`Not enough ${tradeGive}! Need ${rate} for this trade.`);
        return;
      }

      const newPlayers = [...gameState.players];
      newPlayers[currentPlayer.id].resources[tradeGive] -= rate;
      newPlayers[currentPlayer.id].resources[tradeGet] += 1;

      const tradeType = rate === 4 ? "Bank Trade" : "Maritime Trade";

      playSound(SOUNDS.TRADE);
      setGameState({
        ...gameState,
        players: newPlayers,
        phase: 'BUILDING',
        logs: [...gameState.logs, `${currentPlayer.name} used ${tradeType}: ${rate} ${tradeGive} for 1 ${tradeGet}.`].slice(-5)
      });
      setTradeGive(null);
      setTradeGet(null);
    } else {
      if (targetPlayerId === null) return;
      const targetPlayer = gameState.players[targetPlayerId];
      
      const canInitiatorAfford = Object.entries(p2pOffer).every(([res, amt]) => currentPlayer.resources[res as ResourceType] >= amt);
      const canTargetAfford = Object.entries(p2pRequest).every(([res, amt]) => targetPlayer.resources[res as ResourceType] >= amt);
      
      if (!canInitiatorAfford) { alert("You don't have enough resources to offer this."); return; }
      if (!canTargetAfford) { alert(`${targetPlayer.name} doesn't have enough resources for your request.`); return; }

      const newPlayers = JSON.parse(JSON.stringify(gameState.players));
      Object.entries(p2pOffer).forEach(([res, amt]) => {
        newPlayers[currentPlayer.id].resources[res as ResourceType] -= amt;
        newPlayers[targetPlayerId].resources[res as ResourceType] += amt;
      });
      Object.entries(p2pRequest).forEach(([res, amt]) => {
        newPlayers[targetPlayerId].resources[res as ResourceType] -= amt;
        newPlayers[currentPlayer.id].resources[res as ResourceType] += amt;
      });

      playSound(SOUNDS.TRADE);
      setGameState({
        ...gameState,
        players: newPlayers,
        phase: 'BUILDING',
        logs: [...gameState.logs, `${currentPlayer.name} traded with ${targetPlayer.name}.`].slice(-5)
      });
      
      setP2pOffer({ WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0 });
      setP2pRequest({ WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0 });
      setTargetPlayerId(null);
    }
  };

  const updateP2p = (type: 'OFFER' | 'REQUEST', res: ResourceType, delta: number) => {
    const setter = type === 'OFFER' ? setP2pOffer : setP2pRequest;
    setter(prev => ({
      ...prev,
      [res]: Math.max(0, (prev[res] || 0) + delta)
    }));
  };

  const canAfford = (player: Player, cost: Partial<Record<ResourceType, number>>) => {
    return Object.entries(cost).every(([res, amt]) => player.resources[res as ResourceType] >= (amt || 0));
  };

  const spendResources = (player: Player, cost: Partial<Record<ResourceType, number>>) => {
    const updated = { ...player.resources };
    Object.entries(cost).forEach(([res, amt]) => {
      updated[res as ResourceType] -= (amt || 0);
    });
    return updated;
  };

  const buildSettlement = (intId: string) => {
    if (!gameState || gameState.phase !== 'BUILDING') return;
    const player = gameState.players[gameState.currentPlayerIndex];
    const intersection = gameState.intersections[intId];

    if (intersection.owner === player.id && intersection.type === 'SETTLEMENT') {
      const cityCost = BUILDING_COSTS.CITY;
      if (!canAfford(player, cityCost)) return;
      
      playSound(SOUNDS.BUILD);

      const newIntersections = { ...gameState.intersections };
      newIntersections[intId].type = 'CITY';
      const newPlayers = [...gameState.players];
      newPlayers[player.id].resources = spendResources(player, cityCost);
      newPlayers[player.id].victoryPoints += 1; 
      let nextState = updateSpecialAwards({ ...gameState, intersections: newIntersections, players: newPlayers, logs: [...gameState.logs, `${player.name} built a City.`].slice(-5)});
      setGameState(nextState);
      checkVictory(nextState.players);
      return;
    }

    const cost = BUILDING_COSTS.SETTLEMENT;
    if (!canAfford(player, cost) || intersection.owner !== null) return;

    const isAdjacentToRoad = (Object.values(gameState.edges) as Edge[]).some(e => 
      e.owner === player.id && e.adjacentIntersections.includes(intId)
    );
    const hasAnyBuildings = (Object.values(gameState.intersections) as Intersection[]).some(i => i.owner === player.id);
    if (hasAnyBuildings && !isAdjacentToRoad) return;

    playSound(SOUNDS.BUILD);

    const newIntersections = { ...gameState.intersections };
    newIntersections[intId].owner = player.id;
    newIntersections[intId].type = 'SETTLEMENT';
    const newPlayers = [...gameState.players];
    newPlayers[player.id].resources = spendResources(player, cost);
    newPlayers[player.id].victoryPoints += 1;
    let nextState = updateSpecialAwards({ ...gameState, intersections: newIntersections, players: newPlayers, logs: [...gameState.logs, `${player.name} founded a Settlement.`].slice(-5)});
    setGameState(nextState);
    checkVictory(nextState.players);
  };

  const buildRoad = (edgeId: string) => {
    if (!gameState || gameState.phase !== 'BUILDING') return;
    const player = gameState.players[gameState.currentPlayerIndex];
    const cost = BUILDING_COSTS.ROAD;

    if (!canAfford(player, cost)) return;
    const edge = gameState.edges[edgeId];
    if (edge.owner !== null) return;

    const isAdjacentToBuilding = edge.adjacentIntersections.some(intId => 
      gameState.intersections[intId].owner === player.id
    );
    const isAdjacentToRoad = (Object.values(gameState.edges) as Edge[]).some(e => 
      e.id !== edgeId && e.owner === player.id && 
      e.adjacentIntersections.some(intId => edge.adjacentIntersections.includes(intId))
    );

    if (!isAdjacentToBuilding && !isAdjacentToRoad) return;

    playSound(SOUNDS.BUILD);

    const newEdges = { ...gameState.edges };
    newEdges[edgeId].owner = player.id;
    const newPlayers = [...gameState.players];
    newPlayers[player.id].resources = spendResources(player, cost);
    
    let nextState = updateSpecialAwards({ ...gameState, edges: newEdges, players: newPlayers, logs: [...gameState.logs, `${player.name} paved a road.`].slice(-5)});
    setGameState(nextState);
    checkVictory(nextState.players);
  };

  const getAdvice = async () => {
    if (!gameState) return;
    setLoadingAdvice(true);
    const aiAdvice = await getStrategicAdvice(gameState);
    setAdvice(aiAdvice);
    setLoadingAdvice(false);
  };

  if (!gameState) return <div className="flex items-center justify-center h-screen bg-slate-900 text-white font-medieval text-3xl animate-pulse">Forging Catan...</div>;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const winnerActual = gameState.players.find(p => p.victoryPoints >= 10);
  const displayedDice = isRolling ? tempDice : (gameState.diceRoll || [1, 1]);

  // Collapsible Mobile Menu Components
  const TradingPanel = () => (
    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-3xl p-4 lg:p-5 shadow-xl animate-in fade-in zoom-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-indigo-600 font-black text-xs uppercase flex items-center gap-2">
          <i className="fa-solid fa-right-left"></i> Trading Hub
        </h3>
        <button onClick={() => setGameState({...gameState, phase: 'BUILDING'})} className="text-indigo-400 hover:text-indigo-600 p-2"><i className="fa-solid fa-xmark"></i></button>
      </div>

      <div className="flex bg-indigo-100 rounded-xl p-1 mb-4">
        <button 
        onClick={() => setTradeMode('MARITIME')}
        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tradeMode === 'MARITIME' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}
        >
          Bank / Ports
        </button>
        <button 
        onClick={() => setTradeMode('PLAYER')}
        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tradeMode === 'PLAYER' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}
        >
          Players
        </button>
      </div>
      
      {tradeMode === 'MARITIME' ? (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Give Resource (Rate:1)</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(INITIAL_RESOURCES).filter(r => r !== 'DESERT').map(res => {
                const r = res as ResourceType;
                const rate = getBestRateForResource(currentPlayer, r);
                const canTrade = currentPlayer.resources[r] >= rate;
                return (
                  <button 
                    key={res} 
                    onClick={() => setTradeGive(r)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all border-2 ${tradeGive === r ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-indigo-100 text-indigo-900 hover:border-indigo-300'} ${!canTrade ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {res} <span className="text-xs ml-1">{rate}:1</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Receive Resource</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(INITIAL_RESOURCES).filter(r => r !== 'DESERT' && r !== tradeGive).map(res => {
                const r = res as ResourceType;
                return (
                  <button 
                    key={res} 
                    onClick={() => setTradeGet(r)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all border-2 ${tradeGet === r ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-indigo-100 text-indigo-900 hover:border-indigo-300'}`}
                  >
                    {res}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Trade With</p>
            <div className="flex gap-2">
              {gameState.players.filter(p => p.id !== currentPlayer.id).map(p => (
                <button 
                key={p.id}
                onClick={() => setTargetPlayerId(p.id)}
                className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-black border-2 transition-all ${targetPlayerId === p.id ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}`}
                >
                  <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{backgroundColor: p.color}}></div>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-black text-rose-500 uppercase mb-2">You Give</p>
              <div className="space-y-1">
                {Object.keys(INITIAL_RESOURCES).filter(r => r !== 'DESERT').map(res => (
                  <div key={res} className="flex items-center justify-between bg-white p-1 rounded-lg border border-rose-100">
                    <span className="text-[8px] font-bold text-slate-500">{res.slice(0,3)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateP2p('OFFER', res as ResourceType, -1)} className="text-rose-400"><i className="fa-solid fa-minus"></i></button>
                      <span className="text-[10px] font-black w-3 text-center">{(p2pOffer as any)[res]}</span>
                      <button onClick={() => updateP2p('OFFER', res as ResourceType, 1)} className="text-rose-600"><i className="fa-solid fa-plus"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black text-emerald-500 uppercase mb-2">You Want</p>
              <div className="space-y-1">
                {Object.keys(INITIAL_RESOURCES).filter(r => r !== 'DESERT').map(res => (
                  <div key={res} className="flex items-center justify-between bg-white p-1 rounded-lg border border-emerald-100">
                    <span className="text-[8px] font-bold text-slate-500">{res.slice(0,3)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateP2p('REQUEST', res as ResourceType, -1)} className="text-emerald-400"><i className="fa-solid fa-minus"></i></button>
                      <span className="text-[10px] font-black w-3 text-center">{(p2pRequest as any)[res]}</span>
                      <button onClick={() => updateP2p('REQUEST', res as ResourceType, 1)} className="text-emerald-600"><i className="fa-solid fa-plus"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <button 
        disabled={tradeMode === 'MARITIME' ? (!tradeGive || !tradeGet) : (targetPlayerId === null || (Object.values(p2pOffer).every(v => v === 0) && Object.values(p2pRequest).every(v => v === 0)))}
        onClick={executeTrade}
        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2"
      >
        <i className="fa-solid fa-right-left"></i> Confirm Exchange
      </button>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-100 overflow-hidden relative">
      {/* Victory Overlay */}
      {gameState.phase === 'WON' && winnerActual && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-1000">
          <div className="bg-white p-10 lg:p-12 rounded-[2.5rem] lg:rounded-[3rem] shadow-2xl text-center max-w-sm lg:max-w-md border-4 border-indigo-500 relative overflow-hidden mx-4">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
            <i className="fa-solid fa-crown text-6xl lg:text-7xl text-amber-500 mb-6 drop-shadow-lg"></i>
            <h2 className="medieval text-4xl lg:text-5xl font-bold text-slate-900 mb-4">{winnerActual.name}</h2>
            <p className="text-lg lg:text-xl text-slate-600 mb-8 font-semibold uppercase tracking-widest">Master of Catan</p>
            <div className="flex justify-center gap-4 mb-10">
              <div className="bg-indigo-50 px-5 py-3 lg:px-6 lg:py-4 rounded-2xl lg:rounded-3xl">
                <div className="text-2xl lg:text-3xl font-black text-indigo-600">{winnerActual.victoryPoints}</div>
                <div className="text-[10px] font-bold text-indigo-400 uppercase">Victory Points</div>
              </div>
            </div>
            <button 
              onClick={initGame}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 lg:py-5 rounded-2xl lg:rounded-3xl font-black text-lg lg:text-xl shadow-xl transition-all"
            >
              New Conquest
            </button>
          </div>
        </div>
      )}

      {/* Control Sidebar (Desktop) / Drawer (Mobile) */}
      <div className={`
        fixed inset-0 z-40 transition-transform duration-300 transform lg:relative lg:translate-x-0 
        ${showMenu ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
        w-full lg:w-[400px] bg-white border-t lg:border-t-0 lg:border-r border-slate-300 flex flex-col shadow-2xl
      `}>
        {/* Mobile Handle */}
        <div className="lg:hidden flex justify-center p-2 bg-slate-100" onClick={() => setShowMenu(false)}>
           <div className="w-12 h-1.5 bg-slate-300 rounded-full"></div>
        </div>

        <div className="p-4 lg:p-6 bg-slate-900 text-white relative overflow-hidden shrink-0">
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h1 className="text-2xl lg:text-4xl font-bold medieval tracking-widest text-indigo-300">Catan</h1>
              <p className="text-[10px] uppercase tracking-tighter opacity-60 font-bold">Maritime & Player Hub</p>
            </div>
            <button onClick={() => setShowMenu(false)} className="lg:hidden text-white/50 hover:text-white">
              <i className="fa-solid fa-circle-chevron-down text-2xl"></i>
            </button>
          </div>
          <i className="fa-solid fa-chess-rook absolute -bottom-4 -right-4 text-7xl opacity-10"></i>
        </div>

        <div className="p-4 lg:p-6 space-y-6 flex-1 overflow-y-auto pb-32 lg:pb-6">
          {/* Trade UI - Inlined or Floating */}
          {gameState.phase === 'TRADING' && <TradingPanel />}

          {/* Players Display */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Empire Standings</h2>
              <span className="text-[9px] font-bold text-slate-400">Target: 10 VP</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
              {gameState.players.map(p => (
                <div key={p.id} className={`p-4 rounded-2xl border-2 transition-all duration-300 ${gameState.currentPlayerIndex === p.id ? 'border-indigo-500 bg-indigo-50/50 shadow-lg' : 'border-slate-100 bg-white opacity-80'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-lg shadow-sm border border-black/20" style={{ backgroundColor: p.color }}></div>
                      <span className={`font-black text-slate-800 ${gameState.currentPlayerIndex === p.id ? 'text-base lg:text-lg' : 'text-sm lg:text-base'}`}>{p.name}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] lg:text-xs font-black text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">{p.victoryPoints} / 10 VP</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.entries(p.resources).filter(([k]) => k !== 'DESERT').map(([res, amt]) => {
                      const terrainKey = Object.keys(TERRAIN_DATA).find(k => TERRAIN_DATA[k as keyof typeof TERRAIN_DATA].resource === res);
                      const color = (TERRAIN_DATA as any)[terrainKey as any].color;
                      return (
                        <div key={res} className="bg-white border-2 border-slate-50 rounded-xl p-1 shadow-sm text-center">
                          <div className="w-full h-1 rounded-full mb-1" style={{ backgroundColor: color }}></div>
                          <div className="text-[8px] font-bold text-slate-400 truncate">{res.slice(0, 3)}</div>
                          <div className="text-slate-900 text-xs lg:text-sm font-black">{amt}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dev Cards Section */}
          {currentPlayer.devCards.some(c => !c.played && c.type !== 'VICTORY_POINT') && (
            <div className="space-y-3">
              <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Secret Arsenal</h2>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {currentPlayer.devCards.map(c => !c.played && c.type !== 'VICTORY_POINT' && (
                  <button
                    key={c.id}
                    onClick={() => playDevCard(c.id)}
                    disabled={c.played || (c.boughtThisTurn && c.type !== 'VICTORY_POINT') || gameState.phase === 'WON' || gameState.phase === 'MOVING_ROBBER'}
                    className={`flex-shrink-0 w-20 lg:w-24 p-2 lg:p-3 rounded-xl border-2 transition-all bg-white border-indigo-100 hover:border-indigo-500 shadow-md flex flex-col items-center gap-1 group`}
                  >
                    <div className="text-[8px] lg:text-[9px] font-black text-slate-800 text-center uppercase group-hover:text-indigo-600">{c.type.replace('_', ' ')}</div>
                    <i className={`fa-solid ${c.type === 'KNIGHT' ? 'fa-shield-halved' : c.type === 'MONOPOLY' ? 'fa-sack-dollar' : 'fa-scroll'} text-indigo-400 text-sm lg:text-base`}></i>
                    <span className="text-[7px] lg:text-[8px] uppercase font-black text-indigo-300">{c.boughtThisTurn ? 'LOCKED' : 'PLAY'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Advisor */}
          <div className="bg-indigo-950 rounded-3xl p-4 lg:p-6 text-white shadow-2xl relative overflow-hidden">
            <h2 className="text-xs font-black mb-3 flex items-center gap-3 text-indigo-300 uppercase tracking-widest">
              <i className="fa-solid fa-brain-circuit"></i> Advisor
            </h2>
            <div className="text-[11px] leading-relaxed mb-4 bg-black/30 p-3 rounded-xl border border-white/5 min-h-[60px]">
              {loadingAdvice ? "Thinking..." : advice}
            </div>
            <button 
              onClick={getAdvice}
              disabled={loadingAdvice || gameState.phase === 'WON'}
              className="w-full bg-white text-indigo-950 hover:bg-indigo-50 py-2.5 rounded-xl font-black transition-all shadow-xl uppercase text-[10px] tracking-widest"
            >
              Consult AI
            </button>
          </div>

          {/* Log & Chat Tabs */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col min-h-[220px]">
             <div className="flex gap-2 mb-3 border-b border-slate-200 pb-2">
                <button 
                  onClick={() => setActiveTab('LOG')}
                  className={`text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all ${activeTab === 'LOG' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Logs
                </button>
                <button 
                  onClick={() => setActiveTab('CHAT')}
                  className={`text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all ${activeTab === 'CHAT' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Chat {gameState.chatMessages.length > 0 && `(${gameState.chatMessages.length})`}
                </button>
             </div>

             <div className="flex-1 overflow-hidden">
                {activeTab === 'LOG' ? (
                  <div className="h-40 lg:h-48 overflow-y-auto space-y-2 pr-2">
                    {gameState.logs.map((log, i) => (
                      <div key={i} className="text-[10px] lg:text-[11px] leading-tight text-slate-600 bg-white p-2 rounded-lg shadow-sm flex gap-2">
                        <span className="text-indigo-400 font-bold">»</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div ref={chatScrollRef} className="flex-1 h-32 lg:h-40 overflow-y-auto space-y-3 pr-2 mb-3">
                      {gameState.chatMessages.length === 0 ? (
                        <div className="text-[10px] text-slate-400 italic text-center py-4">No messages yet. Say hello!</div>
                      ) : (
                        gameState.chatMessages.map((msg) => (
                          <div key={msg.id} className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[9px] font-black uppercase" style={{ color: (gameState.players as any)[msg.playerId]?.color || '#94a3b8' }}>{msg.playerName}</span>
                              <span className="text-[8px] text-slate-300">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-[11px] text-slate-700 bg-white p-2 rounded-xl rounded-tl-none shadow-sm border border-slate-100 max-w-[90%]">
                              {msg.text}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Send a message..."
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        type="submit"
                        disabled={!chatInput.trim()}
                        className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-[11px] font-black disabled:opacity-50 transition-all"
                      >
                        <i className="fa-solid fa-paper-plane"></i>
                      </button>
                    </form>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 relative flex items-center justify-center bg-[#f0f9ff] overflow-hidden select-none touch-none">
        
        {/* Mobile Header Overlay */}
        <div className="lg:hidden absolute top-4 left-4 right-4 flex justify-between items-center z-30 pointer-events-none">
           <div className="bg-white/80 backdrop-blur shadow-md px-4 py-2 rounded-full flex items-center gap-3 pointer-events-auto border border-white/20">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: currentPlayer.color}}></div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{currentPlayer.name.split(' ')[0]}</span>
              <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{currentPlayer.victoryPoints} VP</span>
           </div>
           
           <button 
            onClick={() => setShowMenu(true)}
            className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center pointer-events-auto border border-slate-100"
           >
              <i className="fa-solid fa-bars text-slate-600"></i>
           </button>
        </div>

        {/* The Board */}
        <svg 
          viewBox="-420 -420 840 840" 
          className="w-full h-full p-4 lg:p-12 max-w-[100vh] max-h-[100vh] cursor-grab active:cursor-grabbing"
          style={{ overflow: 'visible' }}
        >
          {/* Hexagons */}
          {gameState.board.map(hex => {
            const { x, y } = getHexCoords(hex.q, hex.r);
            const data = TERRAIN_DATA[hex.terrain];
            const isRobberHex = gameState.robberHexId === hex.id;
            const canPlaceRobber = gameState.phase === 'MOVING_ROBBER' && !isRobberHex;
            const points = [];
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 180) * (60 * i);
              // Explicit arithmetic to ensure numeric operations
              points.push(`${Number(x) + Number(HEX_SIZE) * Math.cos(angle)},${Number(y) + Number(HEX_SIZE) * Math.sin(angle)}`);
            }
            return (
              <g key={hex.id} onClick={() => canPlaceRobber && moveRobber(hex.id)} className={canPlaceRobber ? "cursor-pointer" : ""}>
                <polygon
                  points={points.join(' ')}
                  fill={data.color}
                  stroke="#1a2e1a"
                  strokeWidth="3"
                  className={`hex-path ${isRobberHex ? 'opacity-70' : ''}`}
                  filter="url(#bevel)"
                />
                {isRobberHex ? (
                  <g className="new-build">
                    <circle cx={x} cy={y} r="25" fill="#333" fillOpacity="0.8" />
                    {/* Fixed arithmetic by explicitly casting coordinate values as numbers */}
                    <foreignObject x={Number(x) - 12} y={Number(y) - 14} width="24" height="24">
                      <div className="text-white text-center text-xl">
                        <i className="fa-solid fa-user-secret"></i>
                      </div>
                    </foreignObject>
                  </g>
                ) : hex.terrain !== 'DESERT' && (
                  <>
                    <circle cx={x} cy={y} r="20" fill="#fff" fillOpacity="0.9" stroke="#333" strokeWidth="1" />
                    {/* Explicitly cast y to number for arithmetic operation to fix compiler errors */}
                    <text x={x} y={Number(y) + 6} textAnchor="middle" className="text-lg font-black fill-slate-900" style={{ fontFamily: 'Inter' }}>
                      {hex.tokenValue}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Ports */}
          {(Object.values(gameState.intersections) as Intersection[]).map((int) => {
            if (!int.port) return null;
            const angle = Math.atan2(int.coords.y, int.coords.x);
            const dist = 35;
            // Explicitly cast components to numbers to ensure arithmetic stability
            const px = Number(int.coords.x) + (Number(dist) * Math.cos(angle));
            const py = Number(int.coords.y) + (Number(dist) * Math.sin(angle));
            const portColor = int.port === '3:1' ? '#444' : (TERRAIN_DATA as any)[Object.keys(TERRAIN_DATA).find(k => (TERRAIN_DATA as any)[k as any].resource === int.port) as any].color;

            return (
              <g key={`port-${int.id}`} className="new-build">
                <circle cx={px} cy={py} r="18" fill={portColor} stroke="white" strokeWidth="2" shadow-md="true" />
                {/* Fixed arithmetic for port labels */}
                <foreignObject x={Number(px) - 10} y={Number(py) - 10} width="20" height="20">
                  <div className="text-white text-center text-sm flex items-center justify-center h-full">
                    {int.port === '3:1' ? <i className="fa-solid fa-anchor"></i> : <span className="font-black text-[10px]">{int.port[0]}</span>}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Roads */}
          {(Object.values(gameState.edges) as Edge[]).map(edge => {
            const int1 = gameState.intersections[edge.adjacentIntersections[0]];
            const int2 = gameState.intersections[edge.adjacentIntersections[1]];
            if (!int1 || !int2) return null;
            const ownerId = edge.owner;
            const owner = ownerId !== null ? gameState.players[ownerId] : null;
            const isHovered = hoveredEdge === edge.id;

            return (
              <g key={edge.id}>
                {!owner && gameState.phase === 'BUILDING' && (
                  <line
                    x1={int1.coords.x} y1={int1.coords.y}
                    x2={int2.coords.x} y2={int2.coords.y}
                    stroke={currentPlayer.color} 
                    strokeWidth="24" 
                    strokeOpacity={isHovered ? "0.4" : "0.05"}
                    className="cursor-pointer transition-all duration-300"
                    onMouseEnter={() => setHoveredEdge(edge.id)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    onClick={() => buildRoad(edge.id)}
                  />
                )}
                {owner && (
                  <g className={`new-build ${ownerId === gameState.currentPlayerIndex ? 'active-road' : ''}`}>
                    <line x1={int1.coords.x} y1={int1.coords.y} x2={int2.coords.x} y2={int2.coords.y} stroke="black" strokeWidth="12" strokeOpacity="0.2" strokeLinecap="round" transform="translate(2, 2)"/>
                    <line x1={int1.coords.x} y1={int1.coords.y} x2={int2.coords.x} y2={int2.coords.y} stroke={owner.color} strokeWidth="10" strokeLinecap="round" filter="url(#bevel)"/>
                  </g>
                )}
              </g>
            );
          })}

          {/* Buildings */}
          {(Object.values(gameState.intersections) as Intersection[]).map((int) => {
            const ownerId = int.owner;
            const owner = ownerId !== null ? gameState.players[ownerId] : null;
            const isCity = int.type === 'CITY';

            return (
              <g key={int.id}>
                {!owner && gameState.phase === 'BUILDING' && (
                  <circle
                    cx={int.coords.x} cy={int.coords.y} r="20"
                    fill="white" fillOpacity="0.1"
                    className="hover:fill-opacity-50 cursor-pointer transition-all"
                    onClick={() => buildSettlement(int.id)}
                  />
                )}
                {owner && (
                  <g className="new-build cursor-pointer" onClick={() => buildSettlement(int.id)}>
                    {isCity ? (
                      /* Fixed path d attribute coordinate calculations with explicit number casting */
                      <path d={`M ${Number(int.coords.x) - 12} ${Number(int.coords.y) + 10} L ${Number(int.coords.x) - 12} ${Number(int.coords.y) - 6} L ${Number(int.coords.x) - 4} ${Number(int.coords.y) - 14} L ${Number(int.coords.x) + 6} ${Number(int.coords.y) - 6} L ${Number(int.coords.x) + 14} ${Number(int.coords.y) - 14} L ${Number(int.coords.x) + 14} ${Number(int.coords.y) + 10} Z`} fill={owner.color} stroke="#fff" strokeWidth="2" filter="url(#bevel)"/>
                    ) : (
                      <path d={`M ${Number(int.coords.x)} ${Number(int.coords.y) - 12} L ${Number(int.coords.x) + 10} ${Number(int.coords.y)} L ${Number(int.coords.x) + 10} ${Number(int.coords.y) + 10} L ${Number(int.coords.x) - 10} ${Number(int.coords.y) + 10} L ${Number(int.coords.x) - 10} ${Number(int.coords.y)} Z`} fill={owner.color} stroke="#fff" strokeWidth="2" filter="url(#bevel)"/>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Dice Visual (Mobile) */}
        {(gameState.diceRoll || isRolling) && (
          <div className="absolute top-20 right-4 lg:top-12 lg:right-12 flex gap-2 lg:gap-4 z-20">
            {displayedDice.map((v, i) => (
              <div 
                key={i} 
                className={`w-12 h-12 lg:w-20 lg:h-20 bg-white rounded-xl lg:rounded-2xl flex items-center justify-center text-xl lg:text-4xl font-black shadow-xl border-2 lg:border-4 border-indigo-50 transition-all ${isRolling ? 'dice-rolling border-rose-100' : 'animate-in fade-in zoom-in duration-500'}`}
              >
                {v}
              </div>
            ))}
          </div>
        )}

        {/* Bottom Actions Floating Overlay (Mobile) */}
        <div className="lg:hidden absolute bottom-6 left-6 right-6 flex flex-col gap-3 z-30 pointer-events-none">
          {gameState.phase === 'BUILDING' && (
            <div className="flex gap-2 pointer-events-auto">
              <button 
                onClick={() => setGameState({...gameState, phase: 'TRADING'})}
                className="flex-1 bg-white/90 backdrop-blur text-slate-900 h-14 rounded-2xl shadow-xl font-black text-xs uppercase border border-slate-200"
              >
                <i className="fa-solid fa-right-left mr-2"></i> Trade
              </button>
              <button 
                onClick={buyDevCard}
                className="flex-1 bg-amber-500/90 backdrop-blur text-white h-14 rounded-2xl shadow-xl font-black text-xs uppercase"
              >
                <i className="fa-solid fa-scroll mr-2"></i> Card
              </button>
              <button 
                onClick={handleEndTurn}
                className="flex-1 bg-slate-900/90 backdrop-blur text-white h-14 rounded-2xl shadow-xl font-black text-xs uppercase"
              >
                End
              </button>
            </div>
          )}

          {gameState.phase === 'ROLLING' && (
            <button 
              onClick={handleRollDice}
              disabled={isRolling}
              className="w-full bg-rose-600/90 backdrop-blur text-white h-16 rounded-2xl shadow-xl font-black text-lg uppercase pointer-events-auto"
            >
              {isRolling ? 'Rolling...' : <><i className="fa-solid fa-dice mr-3"></i> Roll Dice</>}
            </button>
          )}

          {gameState.phase === 'MOVING_ROBBER' && (
             <div className="w-full bg-rose-500 text-white h-14 rounded-2xl flex items-center justify-center font-black text-xs uppercase shadow-xl pointer-events-auto animate-pulse">
                Move the Robber!
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
