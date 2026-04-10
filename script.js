const ringState = {
  mode: "container",
  action: "camera-stream",
};

const ringModeText = {
  container: "Containers share the host kernel, so isolation is lightweight and fast but privileged work still depends on the same host control plane.",
  full: "Full virtualization emulates more of the machine, so the hypervisor has to translate or trap more guest behavior before hardware sees it.",
  assisted: "Hardware-assisted virtualization uses CPU support such as VT-x or AMD-V so privileged guest instructions trap into a root mode with less emulation overhead.",
};

const ringActions = {
  "camera-stream": {
    target: "Ring 3 access via kernel mediation",
    outcome: "Allowed as an application request. The OS grants access, while a driver still controls the camera hardware.",
    flow: {
      container: "Application -> system call -> host kernel -> camera driver -> hardware",
      full: "Guest app -> guest kernel -> hypervisor mediation -> host driver -> hardware",
      assisted: "Guest app -> guest kernel -> VT-x trap points when needed -> host driver -> hardware",
    },
    active: ["ring-3"],
    path: ["ring-3", "ring-0", "ring-1"],
  },
  "driver-register": {
    target: "Ring 1 / kernel-adjacent driver privilege",
    outcome: "Blocked for user code. Only privileged driver logic should write directly to device registers.",
    flow: {
      container: "App request denied for direct write -> driver in privileged mode performs safe hardware control",
      full: "Guest app cannot touch device registers directly -> emulated or paravirtual driver path handles it",
      assisted: "Guest app request -> guest kernel -> hypervisor or mapped driver path mediates the final hardware write",
    },
    active: ["ring-1"],
    path: ["ring-1", "ring-0"],
  },
  "allocate-vm": {
    target: "Ring 2 hypervisor service with kernel help",
    outcome: "This is why hypervisors feel like special processes. They negotiate protected resources beyond what ordinary user apps can reserve directly.",
    flow: {
      container: "Not a full VM path. A container runtime asks the host kernel for cgroup and namespace-backed limits instead.",
      full: "Hypervisor service -> kernel memory manager -> reserve host pages for the guest",
      assisted: "Hypervisor service -> kernel -> hardware virtualization support -> guest memory mappings established",
    },
    active: ["ring-2"],
    path: ["ring-2", "ring-0"],
  },
  "guest-io": {
    target: "Root-mode interception path",
    outcome: "A guest kernel may think it owns Ring 0, but critical instructions still get intercepted by the host or the CPU virtualization layer.",
    flow: {
      container: "No separate guest kernel exists here. A container shares the host kernel, so there is no independent privileged guest I/O layer.",
      full: "Guest kernel executes privileged instruction -> hypervisor traps and emulates the operation",
      assisted: "Guest kernel executes privileged instruction -> CPU traps into VMX root / Ring -1 style control path -> hypervisor decides what happens",
    },
    active: ["ring--1"],
    path: ["ring-0", "ring-2", "ring--1"],
  },
  "post-check": {
    target: "Ring -1 pre-boot firmware context",
    outcome: "POST happens before the operating system. It checks core hardware and can stop the boot before any kernel loads.",
    flow: {
      container: "POST occurs outside container concerns because the host machine has already booted before containers exist.",
      full: "Firmware / BIOS -> hardware checks -> bootloader -> operating system",
      assisted: "Firmware / BIOS -> hardware checks -> virtualization extensions available to later hypervisor stages",
    },
    active: ["ring--1"],
    path: ["ring--1"],
  },
  "delete-file": {
    target: "Ring 3 request, Ring 0 metadata work",
    outcome: "Deleting usually removes filesystem metadata first. The data blocks remain until later overwrite, which is why recovery can work after accidental deletion.",
    flow: {
      container: "Application -> host kernel filesystem call -> directory entry removed -> blocks marked free",
      full: "Guest app -> guest filesystem metadata update -> hypervisor backs that storage with host-managed blocks",
      assisted: "Guest app -> guest kernel -> storage virtualization path -> underlying blocks become reusable but not instantly erased",
    },
    active: ["ring-3"],
    path: ["ring-3", "ring-0"],
  },
};

const distributedState = {
  architecture: "client-server",
  notification: "pull",
  logicalClock: 0,
  clientRegistered: false,
  directoryFresh: false,
  leaderHealthy: true,
  clientIpIndex: 0,
  serverIpIndex: 0,
};

const clientIps = ["10.0.14.8", "10.0.21.44", "172.16.9.12", "100.64.2.19"];
const serverIps = ["44.204.10.1", "44.204.10.87", "18.211.30.4"];

const capState = {
  policy: "cp",
  model: "strong",
  partition: true,
  clock: 0,
  nodes: {
    A: { value: 5, version: 0 },
    B: { value: 5, version: 0 },
    C: { value: 5, version: 0 },
  },
};

const consistencySummaries = {
  strong: "Strong consistency always serves the latest committed value or returns an error. Best fit for banks, seat booking, and inventory locks.",
  eventual: "Eventual consistency allows temporary drift, then converges later. Best fit for feeds, large-scale caches, and geo-distributed engagement data.",
  causal: "Causal consistency preserves cause-and-effect order, so replies do not appear before the messages they depend on.",
  "read-your-writes": "Read-your-writes guarantees your own session sees its last successful update immediately, even if other users still read older replicas.",
  monotonic: "Monotonic reads prevent going backwards in time. Once a client has seen a newer value, it should never later see an older one.",
};

const distributedLog = document.getElementById("distributed-log");
const capLog = document.getElementById("cap-log");
const themeToggle = document.getElementById("theme-toggle");

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  if (!themeToggle) {
    return;
  }

  const darkMode = theme === "dark";
  themeToggle.title = darkMode ? "Switch to light theme" : "Switch to dark theme";
  themeToggle.setAttribute("aria-pressed", darkMode ? "true" : "false");
  themeToggle.setAttribute("aria-label", darkMode ? "Switch to light theme" : "Switch to dark theme");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(savedTheme || preferredTheme);
}

function setActiveButton(selector, valueKey, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[valueKey] === value);
  });
}

function setActiveInGroup(selector, activeButton) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("is-active", button === activeButton);
  });
}

function renderRingLab() {
  const action = ringActions[ringState.action];

  document.getElementById("ring-target").textContent = action.target;
  document.getElementById("ring-outcome").textContent = action.outcome;
  document.getElementById("ring-flow").textContent = action.flow[ringState.mode];
  document.getElementById("ring-mode-insight").textContent = ringModeText[ringState.mode];

  document.querySelectorAll(".ring-band").forEach((band) => {
    const ring = band.dataset.ring;
    band.classList.toggle("is-active", action.active.includes(ring));
    band.classList.toggle("is-path", action.path.includes(ring));
  });

  document.querySelectorAll("#ring-actions .pill-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.action === ringState.action);
  });
}

function incrementClock() {
  distributedState.logicalClock += 1;
  document.getElementById("logical-clock").textContent = String(distributedState.logicalClock);
}

function logDistributed(message) {
  const item = document.createElement("li");
  item.textContent = `t${distributedState.logicalClock}: ${message}`;
  distributedLog.prepend(item);
  while (distributedLog.children.length > 6) {
    distributedLog.removeChild(distributedLog.lastChild);
  }
}

function updateDistributedInsight(text) {
  document.getElementById("distributed-insight").textContent = text;
}

function renderDistributedLab() {
  const clientIp = clientIps[distributedState.clientIpIndex];
  const serverIp = serverIps[distributedState.serverIpIndex];
  const hybrid = distributedState.architecture === "hybrid";

  document.getElementById("client-ip").textContent = clientIp;
  document.getElementById("edge-title").textContent = hybrid ? "Tracker / DNS seed" : "Load balancer";
  document.getElementById("edge-endpoint").textContent = hybrid ? "tracker.learncloud.dev" : "api.learncloud.dev";
  document.getElementById("edge-caption").textContent = hybrid
    ? "Peers still need a bootstrap list to find each other"
    : "Stable entry point hides server IP changes";

  document.getElementById("leader-title").textContent = hybrid ? "Coordinator peer" : "Leader";
  document.getElementById("leader-status").textContent = distributedState.leaderHealthy ? "Healthy" : "Election / degraded";
  document.getElementById("leader-caption").textContent = hybrid
    ? "A hybrid peer mesh still uses coordination for discovery and conflict control"
    : `Server IP now ${serverIp}, but clients still enter through the balancer`;

  document.getElementById("peer-status").textContent = hybrid ? "Serving as peer" : "Available";
  document.getElementById("peer-caption").textContent = hybrid
    ? "Peer exchange can continue even if discovery is shaky"
    : "Replica is ready for failover";

  document.querySelectorAll(".node-card").forEach((node) => node.classList.remove("is-warning", "is-active"));
  document.querySelector('[data-node="client"]').classList.toggle("is-warning", !distributedState.directoryFresh && distributedState.notification === "push");
  document.querySelector('[data-node="leader"]').classList.toggle("is-warning", !distributedState.leaderHealthy);
  document.querySelector('[data-node="edge"]').classList.add("is-active");
  if (hybrid) {
    document.querySelector('[data-node="replica-b"]').classList.add("is-active");
  }

  setActiveButton("[data-architecture]", "architecture", distributedState.architecture);
  setActiveButton("[data-notification]", "notification", distributedState.notification);
}

function handleDistributedEvent(eventName) {
  incrementClock();
  const hybrid = distributedState.architecture === "hybrid";

  if (eventName === "register") {
    distributedState.clientRegistered = true;
    distributedState.directoryFresh = true;
    updateDistributedInsight("Push only works after registration. That registration is a pull-like handshake that gives the server a route back to the client.");
    logDistributed(`Client registered from ${clientIps[distributedState.clientIpIndex]}. Directory is now fresh for return traffic.`);
  }

  if (eventName === "send-update") {
    if (distributedState.notification === "pull") {
      distributedState.directoryFresh = true;
      updateDistributedInsight("Pull is simple and robust: the client asks when it wants data, and the server learns the client's current route at the same time.");
      if (!distributedState.leaderHealthy && !hybrid) {
        logDistributed("Client requested an update, but the centralized leader is recovering so the reply is delayed until failover completes.");
      } else {
        logDistributed(`Client pulled the latest state successfully through the ${hybrid ? "tracker / peer path" : "load balancer"}.`);
      }
    } else if (!distributedState.clientRegistered || !distributedState.directoryFresh) {
      updateDistributedInsight("Push failed because the server did not have a fresh route to the client. A keepalive or re-registration must refresh the directory first.");
      logDistributed("Push attempt failed because the client's address record was stale or missing.");
    } else if (!distributedState.leaderHealthy && !hybrid) {
      updateDistributedInsight("A push system still relies on healthy coordination infrastructure behind the scenes.");
      logDistributed("Push could not be issued because the centralized coordinator is unhealthy.");
    } else {
      updateDistributedInsight("Push feels instant, but it stands on top of earlier registration, routing, and health checks.");
      logDistributed(`Server pushed an update to ${clientIps[distributedState.clientIpIndex]} using a fresh device route.`);
    }
  }

  if (eventName === "roam-ip") {
    distributedState.clientIpIndex = (distributedState.clientIpIndex + 1) % clientIps.length;
    distributedState.directoryFresh = false;
    updateDistributedInsight("A client IP change breaks stale push routes until the client talks to the platform again.");
    logDistributed(`Client roamed to ${clientIps[distributedState.clientIpIndex]}. Existing push route is now stale.`);
  }

  if (eventName === "server-ip") {
    distributedState.serverIpIndex = (distributedState.serverIpIndex + 1) % serverIps.length;
    updateDistributedInsight(hybrid
      ? "Even hybrid systems still depend on stable names, trackers, or DNS seeds to absorb server movement."
      : "The load balancer and DNS absorb origin-server IP changes so clients keep one stable entry point.");
    logDistributed(`Origin server changed to ${serverIps[distributedState.serverIpIndex]}, but the public endpoint remained stable.`);
  }

  if (eventName === "leader-fail") {
    distributedState.leaderHealthy = false;
    updateDistributedInsight(hybrid
      ? "Pure P2P is rare. Even in a peer mesh, discovery and conflict management often depend on some coordinating role."
      : "Central leaders simplify coordination, but they create pressure points that demand replication and election logic.");
    logDistributed(hybrid
      ? "Coordinator peer failed. Existing peers can still exchange data, but fresh discovery is degraded."
      : "Leader failed. Replicas are standing by, but centralized coordination is degraded until failover completes.");
  }

  if (eventName === "recover") {
    distributedState.leaderHealthy = true;
    if (distributedState.notification === "pull") {
      distributedState.directoryFresh = true;
    }
    updateDistributedInsight("Recovery usually means election, replica promotion, or refreshed discovery state. The architecture hides that complexity from users when designed well.");
    logDistributed("Cluster recovered. Replicas and directories are back in a healthy coordination state.");
  }

  renderDistributedLab();
}

function logCap(message) {
  const item = document.createElement("li");
  item.textContent = `t${capState.clock}: ${message}`;
  capLog.prepend(item);
  while (capLog.children.length > 7) {
    capLog.removeChild(capLog.lastChild);
  }
}

function getNewestVersion() {
  return Math.max(capState.nodes.A.version, capState.nodes.B.version, capState.nodes.C.version);
}

function renderCapLab() {
  ["A", "B", "C"].forEach((nodeKey) => {
    document.getElementById(`value-${nodeKey}`).textContent = String(capState.nodes[nodeKey].value);
    document.getElementById(`version-${nodeKey}`).textContent = `v${capState.nodes[nodeKey].version}`;
  });

  document.getElementById("partition-state").textContent = capState.partition ? "Network partition active" : "Cluster connected";
  document.getElementById("cap-policy-summary").textContent = capState.policy === "cp"
    ? "CP protects one consistent truth. The isolated side may reject reads or writes during the split."
    : "AP keeps serving traffic on both sides of the split. Diverged values are allowed until reconciliation.";
  document.getElementById("consistency-summary").textContent = consistencySummaries[capState.model];
  document.getElementById("partition-line").classList.toggle("is-visible", capState.partition);
  document.getElementById("toggle-partition").textContent = capState.partition ? "Remove partition" : "Create partition";
  document.getElementById("toggle-partition").classList.toggle("is-active", capState.partition);

  setActiveButton("[data-policy]", "policy", capState.policy);
  setActiveButton("#consistency-models [data-model]", "model", capState.model);

  document.querySelectorAll(".cap-node").forEach((node) => {
    node.classList.remove("is-warning", "is-active");
  });

  if (capState.partition) {
    document.querySelector('[data-cap-node="B"]').classList.add("is-warning");
    document.querySelector('[data-cap-node="A"]').classList.add("is-active");
    document.querySelector('[data-cap-node="C"]').classList.add("is-active");
  }
}

function writeCap(side) {
  const value = Number(document.getElementById("cap-write-value").value || 0);
  capState.clock += 1;

  if (!capState.partition) {
    ["A", "B", "C"].forEach((nodeKey) => {
      capState.nodes[nodeKey].value = value;
      capState.nodes[nodeKey].version = capState.clock;
    });
    logCap(`Cluster connected. Write ${value} replicated to all nodes.`);
    renderCapLab();
    return;
  }

  if (capState.policy === "cp") {
    if (side === "right") {
      logCap(`Write ${value} on isolated node B was rejected to preserve consistency.`);
    } else {
      ["A", "C"].forEach((nodeKey) => {
        capState.nodes[nodeKey].value = value;
        capState.nodes[nodeKey].version = capState.clock;
      });
      logCap(`Quorum write ${value} committed on A/C. Node B is now unavailable for fresh reads until healing.`);
    }
    renderCapLab();
    return;
  }

  if (side === "left") {
    ["A", "C"].forEach((nodeKey) => {
      capState.nodes[nodeKey].value = value;
      capState.nodes[nodeKey].version = capState.clock;
    });
    logCap(`AP accepted write ${value} on A/C while B remained stale.`);
  } else {
    capState.nodes.B.value = value;
    capState.nodes.B.version = capState.clock;
    logCap(`AP accepted write ${value} on isolated node B. The cluster now has multiple truths.`);
  }

  renderCapLab();
}

function healPartition() {
  capState.clock += 1;

  if (!capState.partition) {
    logCap("Cluster was already connected. No reconciliation was needed.");
    renderCapLab();
    return;
  }

  capState.partition = false;

  if (capState.policy === "cp") {
    const canonical = capState.nodes.A.version >= capState.nodes.C.version ? capState.nodes.A : capState.nodes.C;
    capState.nodes.B.value = canonical.value;
    capState.nodes.B.version = capState.clock;
    capState.nodes.A.version = Math.max(capState.nodes.A.version, capState.clock);
    capState.nodes.C.version = Math.max(capState.nodes.C.version, capState.clock);
    logCap(`Partition healed. Node B caught up to the committed value ${canonical.value}.`);
  } else {
    const newestVersion = getNewestVersion();
    const newestNode = ["A", "B", "C"].reduce((best, key) => {
      return capState.nodes[key].version >= capState.nodes[best].version ? key : best;
    }, "A");
    const winningValue = capState.nodes[newestNode].value;

    ["A", "B", "C"].forEach((nodeKey) => {
      capState.nodes[nodeKey].value = winningValue;
      capState.nodes[nodeKey].version = capState.clock;
    });

    logCap(`Partition healed. Last-write-wins reconciliation chose ${winningValue} from ${newestNode} (previous max version v${newestVersion}).`);
  }

  renderCapLab();
}

function togglePartition() {
  capState.clock += 1;
  capState.partition = !capState.partition;
  logCap(capState.partition
    ? "Network link between A/C and B failed. The cluster is now partitioned."
    : "Network restored without forced reconciliation yet.");
  renderCapLab();
}

document.getElementById("virtualization-mode").addEventListener("change", (event) => {
  ringState.mode = event.target.value;
  renderRingLab();
});

document.querySelectorAll("#ring-actions .pill-button").forEach((button) => {
  button.addEventListener("click", () => {
    ringState.action = button.dataset.action;
    renderRingLab();
  });
});

document.querySelectorAll("[data-architecture]").forEach((button) => {
  button.addEventListener("click", () => {
    distributedState.architecture = button.dataset.architecture;
    renderDistributedLab();
    updateDistributedInsight(distributedState.architecture === "hybrid"
      ? "Hybrid P2P keeps peer exchange, but still uses shared discovery and coordination surfaces."
      : "Client-server centralizes control, which simplifies operations but raises leader pressure.");
    incrementClock();
    logDistributed(`Architecture switched to ${distributedState.architecture}.`);
  });
});

document.querySelectorAll("[data-notification]").forEach((button) => {
  button.addEventListener("click", () => {
    distributedState.notification = button.dataset.notification;
    renderDistributedLab();
    updateDistributedInsight(distributedState.notification === "push"
      ? "Push delivery needs a previously known route to the client."
      : "Pull trades immediacy for simplicity and resilience.");
    incrementClock();
    logDistributed(`Notification mode switched to ${distributedState.notification}.`);
  });
});

document.querySelectorAll("[data-distributed-event]").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveInGroup("[data-distributed-event]", button);
    handleDistributedEvent(button.dataset.distributedEvent);
  });
});

document.querySelectorAll("[data-policy]").forEach((button) => {
  button.addEventListener("click", () => {
    capState.policy = button.dataset.policy;
    capState.clock += 1;
    logCap(`Policy switched to ${capState.policy.toUpperCase()}.`);
    renderCapLab();
  });
});

document.querySelectorAll("#consistency-models [data-model]").forEach((button) => {
  button.addEventListener("click", () => {
    capState.model = button.dataset.model;
    renderCapLab();
  });
});

document.getElementById("toggle-partition").addEventListener("click", (event) => {
  setActiveInGroup(".write-controls .button-cluster .pill-button", event.currentTarget);
  togglePartition();
});
document.getElementById("write-left").addEventListener("click", (event) => {
  setActiveInGroup(".write-controls .button-cluster .pill-button", event.currentTarget);
  writeCap("left");
});
document.getElementById("write-right").addEventListener("click", (event) => {
  setActiveInGroup(".write-controls .button-cluster .pill-button", event.currentTarget);
  writeCap("right");
});
document.getElementById("heal-partition").addEventListener("click", (event) => {
  setActiveInGroup(".write-controls .button-cluster .pill-button", event.currentTarget);
  healPartition();
});

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
}

initializeTheme();
renderRingLab();
renderDistributedLab();
renderCapLab();
logDistributed("System initialized. Start with a registration to establish a route back to the client.");
logCap("Partition simulator ready. Compare CP and AP behavior using the same write values.");
