/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
'use strict';
// tslint:disable no-var-requires
import * as vscode from 'vscode';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import * as sinonChai from 'sinon-chai';
import { BlockchainWalletExplorerProvider } from '../../extension/explorer/walletExplorer';
import { TestUtil } from '../TestUtil';
import { VSCodeBlockchainOutputAdapter } from '../../extension/logging/VSCodeBlockchainOutputAdapter';
import { WalletTreeItem } from '../../extension/explorer/wallets/WalletTreeItem';
import { ExtensionCommands } from '../../ExtensionCommands';
import { FabricWallet } from 'ibm-blockchain-platform-wallet';
import { IdentityTreeItem } from '../../extension/explorer/model/IdentityTreeItem';
import { BlockchainTreeItem } from '../../extension/explorer/model/BlockchainTreeItem';
import { AdminIdentityTreeItem } from '../../extension/explorer/model/AdminIdentityTreeItem';
import { FabricCertificate, FabricRuntimeUtil, FabricWalletRegistry, FabricWalletRegistryEntry, LogType, FabricWalletGeneratorFactory, FabricEnvironmentRegistry, FabricEnvironmentRegistryEntry, EnvironmentType, FabricEnvironment, FabricIdentity, MicrofabEnvironment } from 'ibm-blockchain-platform-common';
import { ExtensionUtil } from '../../extension/util/ExtensionUtil';
import { WalletGroupTreeItem } from '../../extension/explorer/model/WalletGroupTreeItem';
import { EnvironmentFactory } from '../../extension/fabric/environments/EnvironmentFactory';
import { LocalMicroEnvironmentManager } from '../../extension/fabric/environments/LocalMicroEnvironmentManager';
import { LocalMicroEnvironment } from '../../extension/fabric/environments/LocalMicroEnvironment';
import { FabricWalletHelper } from '../../extension/fabric/FabricWalletHelper';

chai.use(sinonChai);
chai.should();

// tslint:disable no-unused-expression
describe('walletExplorer', () => {

    const mySandBox: sinon.SinonSandbox = sinon.createSandbox();
    let logSpy: sinon.SinonSpy;
    let blockchainWalletExplorerProvider: BlockchainWalletExplorerProvider;
    let blueWalletEntry: FabricWalletRegistryEntry;
    let greenWalletEntry: FabricWalletRegistryEntry;
    let otherEntry: FabricWalletRegistryEntry;
    let getGreenWalletIdentityNamesStub: sinon.SinonStub;
    let getBlueWalletIdentityNamesStub: sinon.SinonStub;
    let getGreenWalletIdentitiesStub: sinon.SinonStub;
    let getBlueWalletIdentitiesStub: sinon.SinonStub;
    let otherWalletIdentitiesStub: sinon.SinonStub;
    let getNewWalletStub: sinon.SinonStub;
    let ensureRuntimeStub: sinon.SinonStub;
    let orgOneIdentities: FabricIdentity[];
    before(async () => {
        await TestUtil.setupTests(mySandBox);
        await TestUtil.setupLocalFabric();
    });

    beforeEach(async () => {

        logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        blockchainWalletExplorerProvider = ExtensionUtil.getBlockchainWalletExplorerProvider();

        blueWalletEntry = new FabricWalletRegistryEntry({
            name: 'blueWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/otherWallet')
        });
        greenWalletEntry = new FabricWalletRegistryEntry({
            name: 'greenWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet')
        });

        otherEntry = new FabricWalletRegistryEntry({
            name: 'otherWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/otherWallet'),
            fromEnvironment: 'mockMicrofab'
        });

        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        await TestUtil.startLocalFabric();
        await FabricWalletRegistry.instance().add(blueWalletEntry);
        await FabricWalletRegistry.instance().add(greenWalletEntry);

        const localEntry: FabricEnvironmentRegistryEntry = await FabricEnvironmentRegistry.instance().get(FabricRuntimeUtil.LOCAL_FABRIC);
        const walletEntry: FabricWalletRegistryEntry = await FabricWalletRegistry.instance().get('Org1', FabricRuntimeUtil.LOCAL_FABRIC);
        orgOneIdentities = await FabricWalletHelper.getVisibleIdentities(localEntry, walletEntry);

        await FabricWalletRegistry.instance().add(otherEntry);

        const greenWallet: FabricWallet = await FabricWallet.newFabricWallet(greenWalletEntry.walletPath);
        const blueWallet: FabricWallet = await FabricWallet.newFabricWallet(blueWalletEntry.walletPath);
        const otherWallet: FabricWallet = await FabricWallet.newFabricWallet(otherEntry.walletPath);

        getNewWalletStub = mySandBox.stub(FabricWalletGeneratorFactory.getFabricWalletGenerator(), 'getWallet');
        getNewWalletStub.callThrough();
        getNewWalletStub.withArgs(greenWalletEntry).returns(greenWallet);
        getNewWalletStub.withArgs(blueWalletEntry).returns(blueWallet);
        getNewWalletStub.withArgs(otherEntry).returns(otherWallet);

        getGreenWalletIdentityNamesStub = mySandBox.stub(greenWallet, 'getIdentityNames');
        getBlueWalletIdentityNamesStub = mySandBox.stub(blueWallet, 'getIdentityNames');
        getGreenWalletIdentitiesStub = mySandBox.stub(greenWallet, 'getIdentities');
        getBlueWalletIdentitiesStub = mySandBox.stub(blueWallet, 'getIdentities');
        otherWalletIdentitiesStub = mySandBox.stub(otherWallet, 'getIdentities');

        ensureRuntimeStub = mySandBox.stub(LocalMicroEnvironmentManager.instance(), 'ensureRuntime');
        ensureRuntimeStub.callThrough();

    });

    afterEach(async () => {
        mySandBox.restore();
    });

    it('should show wallets and identities in the BlockchainWalletExplorer view', async () => {
        getGreenWalletIdentityNamesStub.onCall(0).resolves([]);
        getBlueWalletIdentityNamesStub.resolves(['violetConga', 'purpleConga']);

        const certOne: string = `-----BEGIN CERTIFICATE-----
        MIICGTCCAb+gAwIBAgIQQE5Dc6DHnGXPOqHMG2LG7jAKBggqhkjOPQQDAjBzMQsw
        CQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZy
        YW5jaXNjbzEZMBcGA1UEChMQb3JnMS5leGFtcGxlLmNvbTEcMBoGA1UEAxMTY2Eu
        b3JnMS5leGFtcGxlLmNvbTAeFw0xOTExMjcxMTM0MDBaFw0yOTExMjQxMTM0MDBa
        MFsxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRYwFAYDVQQHEw1T
        YW4gRnJhbmNpc2NvMR8wHQYDVQQDDBZBZG1pbkBvcmcxLmV4YW1wbGUuY29tMFkw
        EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2yJR/UL+6Jfsa70tg9SO/CtwoKutVa84
        IUIm7fVB8Og0OPwA/UmBOoCk2r/91ner/otYba1sNUbao/DP34vVZ6NNMEswDgYD
        VR0PAQH/BAQDAgeAMAwGA1UdEwEB/wQCMAAwKwYDVR0jBCQwIoAgRwvaD6tNjB3i
        Kfo7fP6ItgTQxnzT7IgukY+z/6n5UWEwCgYIKoZIzj0EAwIDSAAwRQIhALa8Amos
        hlfhEnZLdyCEFaumEAIsEnexk1V5lLcwLQ/LAiB9OFexBRlSp+2gBnWhqGU1yfuQ
        UeCDyF4ZXdodV0l7ww==
        -----END CERTIFICATE-----`;

        getBlueWalletIdentitiesStub.resolves([
            { name: 'violetConga', cert: certOne },
            { name: 'purpleConga', cert: certOne }
        ]);

        getGreenWalletIdentitiesStub.resolves([]);

        otherWalletIdentitiesStub.resolves([{name: 'someIdentity', cert: certOne}]);

        const getAttributesStub: sinon.SinonStub = mySandBox.stub(FabricCertificate.prototype, 'getAttributes');
        getAttributesStub.callThrough();
        getAttributesStub.onCall(2).returns({ attr1: 'hello', attr2: 'world' });
        getAttributesStub.onCall(3).returns({ attr3: 'good', attr4: 'day!' });

        const mockRuntime: sinon.SinonStubbedInstance<LocalMicroEnvironment> = mySandBox.createStubInstance(LocalMicroEnvironment);
        mockRuntime.getNodes.resolves([{wallet: 'Org1'}]);
        mockRuntime.getVisibleIdentities.resolves(orgOneIdentities);
        mySandBox.stub(FabricWalletHelper, 'getVisibleIdentities').resolves(orgOneIdentities);

        const getEnvironmentStub: sinon.SinonStub = mySandBox.stub(EnvironmentFactory, 'getEnvironment');
        getEnvironmentStub.callThrough();

        getEnvironmentStub.withArgs(FabricRuntimeUtil.LOCAL_FABRIC).returns(mockRuntime);

        await FabricEnvironmentRegistry.instance().add({name: 'mockMicrofab', environmentType: EnvironmentType.MICROFAB_ENVIRONMENT, url: 'http://someurl:10001'});

        const mockMicrofab: sinon.SinonStubbedInstance<MicrofabEnvironment> = mySandBox.createStubInstance(MicrofabEnvironment);
        getEnvironmentStub.withArgs('mockMicrofab').returns(mockMicrofab);

        const allChildren: Array<BlockchainTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        allChildren.length.should.equal(3);
        allChildren[0].should.be.an.instanceof(WalletGroupTreeItem);
        allChildren[0].label.should.equal(FabricRuntimeUtil.LOCAL_FABRIC);
        ensureRuntimeStub.should.have.been.calledOnce;

        const groupTwo: WalletGroupTreeItem = allChildren[1] as WalletGroupTreeItem;
        const groupTwoWallets: WalletTreeItem[] = await blockchainWalletExplorerProvider.getChildren(groupTwo) as WalletTreeItem[];
        const otherIdentities: Array<IdentityTreeItem> = await blockchainWalletExplorerProvider.getChildren(groupTwoWallets[0]) as Array<IdentityTreeItem>;
        otherIdentities.length.should.equal(1);

        allChildren[2].should.be.an.instanceOf(WalletGroupTreeItem);
        allChildren[2].label.should.equal('Other/shared wallets');

        const groupOne: WalletGroupTreeItem = allChildren[0] as WalletGroupTreeItem;
        groupOne.wallets.length.should.equal(1);

        const localOrgOneWallet: FabricWalletRegistryEntry = await FabricWalletRegistry.instance().get('Org1', FabricRuntimeUtil.LOCAL_FABRIC);

        groupOne.wallets.should.deep.equal([localOrgOneWallet]);
        const groupOneWallets: WalletTreeItem[] = await blockchainWalletExplorerProvider.getChildren(groupOne) as WalletTreeItem[];
        groupOneWallets[0].label.should.equal(`Org1`);

        const localWalletIdentities: Array<IdentityTreeItem> = await blockchainWalletExplorerProvider.getChildren(groupOneWallets[0]) as Array<IdentityTreeItem>;
        localWalletIdentities.length.should.equal(1);
        localWalletIdentities[0].label.should.equal(`Org1 Admin`);
        localWalletIdentities[0].should.be.an.instanceOf(AdminIdentityTreeItem);
        localWalletIdentities[0].walletName.should.equal(`Org1`);

        const groupThree: WalletGroupTreeItem = allChildren[2] as WalletGroupTreeItem;
        groupThree.wallets.length.should.equal(2);
        groupThree.wallets.should.deep.equal([blueWalletEntry, greenWalletEntry]);
        const groupThreeWallets: WalletTreeItem[] = await blockchainWalletExplorerProvider.getChildren(groupThree) as WalletTreeItem[];
        groupThreeWallets[0].label.should.equal(blueWalletEntry.name);
        groupThreeWallets[1].label.should.equal(greenWalletEntry.name);

        const blueWalletIdentities: Array<IdentityTreeItem> = await blockchainWalletExplorerProvider.getChildren(groupThreeWallets[0]) as Array<IdentityTreeItem>;
        blueWalletIdentities.length.should.equal(2);
        blueWalletIdentities[0].label.should.equal('violetConga');
        blueWalletIdentities[0].walletName.should.equal(blueWalletEntry.name);
        blueWalletIdentities[0].tooltip.should.deep.equal(`Attributes:\n\nattr1:hello\nattr2:world`);
        blueWalletIdentities[1].label.should.equal('purpleConga');
        blueWalletIdentities[1].walletName.should.equal(blueWalletEntry.name);
        blueWalletIdentities[1].tooltip.should.deep.equal(`Attributes:\n\nattr3:good\nattr4:day!`);

        const emptyWalletIdentites: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(groupThreeWallets[1]) as Array<WalletTreeItem>;
        emptyWalletIdentites.should.deep.equal([]);

        logSpy.should.not.have.been.calledWith(LogType.ERROR);
    });

    it('should say that there are no wallets', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();
        const wallets: Array<BlockchainTreeItem> = await blockchainWalletExplorerProvider.getChildren();
        wallets.length.should.equal(1);
        wallets[0].label.should.equal(`No wallets found`);
    });

    it('should refresh the BlockchainWalletExplorer view when refresh is called', async () => {
        const onDidChangeTreeDataSpy: sinon.SinonSpy = mySandBox.spy(blockchainWalletExplorerProvider['_onDidChangeTreeData'], 'fire');

        await vscode.commands.executeCommand(ExtensionCommands.REFRESH_WALLETS);
        onDidChangeTreeDataSpy.should.have.been.called;
        logSpy.should.not.have.been.calledWith(LogType.ERROR);
    });

    it('should get a tree item in the BlockchainWalletExplorer view', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        getGreenWalletIdentityNamesStub.resolves([]);
        getBlueWalletIdentityNamesStub.resolves([]);

        await FabricWalletRegistry.instance().clear();
        await FabricWalletRegistry.instance().add(blueWalletEntry);
        await FabricWalletRegistry.instance().add(greenWalletEntry);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        const walletGroupChildren: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        const blueWallet: WalletTreeItem = blockchainWalletExplorerProvider.getTreeItem(walletGroupChildren[0]) as WalletTreeItem;
        blueWallet.label.should.equal('blueWallet');
        logSpy.should.not.have.been.calledWith(LogType.ERROR);
    });

    it('should display an ops tools wallet', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const opsToolsEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        opsToolsEnv.name = 'opsToolsEnv';
        opsToolsEnv.environmentType = EnvironmentType.OPS_TOOLS_ENVIRONMENT;
        await FabricEnvironmentRegistry.instance().add(opsToolsEnv);

        const opsToolsWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'myOpsToolsWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/opsToolsWallet'),
            environmentGroups: [opsToolsEnv.name]
        });
        await FabricWalletRegistry.instance().add(opsToolsWalletEntry);
        const opsToolsWallet: FabricWallet = await FabricWallet.newFabricWallet(opsToolsWalletEntry.walletPath);
        getNewWalletStub.withArgs(opsToolsWalletEntry).returns(opsToolsWallet);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        const walletGroupChildren: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        const opsToolsWalletItem: WalletTreeItem  = walletGroupChildren[0];
        opsToolsWalletItem.label.should.deep.equal(opsToolsWalletEntry.name);
    });

    it('should display a saas ops tools wallet', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const saasEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        saasEnv.name = 'saasEnv';
        saasEnv.environmentType = EnvironmentType.SAAS_OPS_TOOLS_ENVIRONMENT;
        await FabricEnvironmentRegistry.instance().add(saasEnv);

        const saasWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'mySaasWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/saasWallet'),
            environmentGroups: [saasEnv.name]
        });
        await FabricWalletRegistry.instance().add(saasWalletEntry);
        const saasWallet: FabricWallet = await FabricWallet.newFabricWallet(saasWalletEntry.walletPath);
        getNewWalletStub.withArgs(saasWalletEntry).returns(saasWallet);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        const walletGroupChildren: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        const saasWalletItem: WalletTreeItem  = walletGroupChildren[0];
        saasWalletItem.label.should.deep.equal(saasWalletEntry.name);
    });

    it(`should display an 'other' wallet`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const otherWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'myOtherWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/otherWallet'),
        });
        await FabricWalletRegistry.instance().add(otherWalletEntry);
        const otherWallet: FabricWallet = await FabricWallet.newFabricWallet(otherWalletEntry.walletPath);
        getNewWalletStub.withArgs(otherWalletEntry).returns(otherWallet);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        const walletGroupChildren: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        const otherWalletItem: WalletTreeItem  = walletGroupChildren[0];
        otherWalletItem.label.should.deep.equal(otherWalletEntry.name);
    });

    it(`should display wallet groups in the 'Other/shared wallets' section`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const otherUserEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        otherUserEnv.name = 'environmentTwo';
        otherUserEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const userWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'environmentUserWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/someWallet'), // TODO JAKE: Change this?
            environmentGroups: [userEnv.name, otherUserEnv.name],
            fromEnvironment: userEnv.name
        });
        await FabricWalletRegistry.instance().add(userWalletEntry);
        const userWallet: FabricWallet = await FabricWallet.newFabricWallet(userWalletEntry.walletPath);
        getNewWalletStub.withArgs(userWalletEntry).returns(userWallet);

        const opsToolsEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        opsToolsEnv.name = 'opsToolsEnv';
        opsToolsEnv.environmentType = EnvironmentType.OPS_TOOLS_ENVIRONMENT;
        await FabricEnvironmentRegistry.instance().add(opsToolsEnv);

        const opsToolsWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'myOpsToolsWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/opsToolsWallet'),
            environmentGroups: [opsToolsEnv.name, 'randomEnv']
        });
        await FabricWalletRegistry.instance().add(opsToolsWalletEntry);
        const opsToolsWallet: FabricWallet = await FabricWallet.newFabricWallet(opsToolsWalletEntry.walletPath);
        getNewWalletStub.withArgs(opsToolsWalletEntry).returns(opsToolsWallet);

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);

        const getEnvironmentStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get');
        getEnvironmentStub.withArgs(userEnv.name).resolves(userEnv);
        getEnvironmentStub.withArgs(otherUserEnv.name).resolves(otherUserEnv);
        getEnvironmentStub.withArgs(opsToolsEnv.name).resolves(opsToolsEnv);
        getEnvironmentStub.withArgs('randomEnv').resolves(opsToolsEnv);
        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: userWalletEntry.name}]);
        getNodesStub.onCall(2).resolves([{wallet: opsToolsWalletEntry.name}]);
        getNodesStub.onCall(3).resolves([{wallet: opsToolsWalletEntry.name}]);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal('Other/shared wallets');
        const walletSubGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletSubGroups[0].label.should.deep.equal(userEnv.name);
        const groupOne: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletSubGroups[0]) as Array<WalletTreeItem>;
        groupOne[0].label.should.deep.equal(userWalletEntry.name);
        const groupTwo: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletSubGroups[1]) as Array<WalletTreeItem>;
        groupTwo[0].label.should.deep.equal(opsToolsWalletEntry.name);
    });

    it(`should display a wallet group with multiple entries in the 'Other/shared wallets' section`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: [userEnv.name, 'someOtherEnvironment'],
            fromEnvironment: userEnv.name
        });
        const walletThreeEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet3',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet3'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}, {wallet: walletThreeEntry.name}]);
        getNodesStub.onThirdCall().resolves([{wallet: walletTwoEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        await FabricWalletRegistry.instance().add(walletThreeEntry);
        const walletThree: FabricWallet = await FabricWallet.newFabricWallet(walletThreeEntry.walletPath);
        getNewWalletStub.withArgs(walletThreeEntry).returns(walletThree);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal('Other/shared wallets');
        const walletSubGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletSubGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletSubGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
        walletGroupChildren[2].label.should.deep.equal(walletThreeEntry.name);
    });

    it(`should display wallets with and without environmentGroups in a group in 'Other/shared wallets'`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: [userEnv.name, 'someOtherEnvironment'],
            fromEnvironment: userEnv.name
        });
        const walletThreeEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet3',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet3'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}, {wallet: walletThreeEntry.name}]);
        getNodesStub.onSecondCall().resolves([{wallet: walletTwoEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        await FabricWalletRegistry.instance().add(walletThreeEntry);
        const walletThree: FabricWallet = await FabricWallet.newFabricWallet(walletThreeEntry.walletPath);
        getNewWalletStub.withArgs(walletThreeEntry).returns(walletThree);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal('Other/shared wallets');
        const walletSubGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletSubGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletSubGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
        walletGroupChildren[2].label.should.deep.equal(walletThreeEntry.name);
    });

    it(`should display a wallet group in 'Other/shared wallets if fromEnvironment and environmentGroups are different`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: ['someOtherEnvironment'],
            fromEnvironment: userEnv.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletTwoEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal('Other/shared wallets');
        const walletSubGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletSubGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletSubGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
    });

    it('should display multiple different wallet groups', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const userEnvTwo: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnvTwo.name = 'environmentTwo';
        userEnvTwo.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });
        const walletThreeEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet3',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet3'),
            environmentGroups: [userEnvTwo.name],
            fromEnvironment: userEnvTwo.name
        });
        const walletFourEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet4',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet4'),
            environmentGroups: [userEnvTwo.name],
            fromEnvironment: userEnvTwo.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        const getEnvironmentRegistryEntryStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get');
        getEnvironmentRegistryEntryStub.withArgs(userEnv.name).resolves(userEnv);
        getEnvironmentRegistryEntryStub.withArgs(userEnvTwo.name).resolves(userEnvTwo);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}]);
        getNodesStub.onCall(2).resolves([{wallet: walletThreeEntry.name}, {wallet: walletFourEntry.name}]);
        getNodesStub.onCall(3).resolves([{wallet: walletThreeEntry.name}, {wallet: walletFourEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        await FabricWalletRegistry.instance().add(walletThreeEntry);
        const walletThree: FabricWallet = await FabricWallet.newFabricWallet(walletThreeEntry.walletPath);
        getNewWalletStub.withArgs(walletThreeEntry).returns(walletThree);

        await FabricWalletRegistry.instance().add(walletFourEntry);
        const walletFour: FabricWallet = await FabricWallet.newFabricWallet(walletFourEntry.walletPath);
        getNewWalletStub.withArgs(walletFourEntry).returns(walletFour);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups.length.should.equal(2);

        const userEnvGroupOne: WalletTreeItem = walletGroups[0];
        userEnvGroupOne.label.should.deep.equal(userEnv.name);
        const userEnvGroupChildrenOne: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(userEnvGroupOne) as Array<WalletTreeItem>;
        userEnvGroupChildrenOne[0].label.should.deep.equal(walletOneEntry.name);
        userEnvGroupChildrenOne[1].label.should.deep.equal(walletTwoEntry.name);

        const userEnvGroupTwo: WalletTreeItem = walletGroups[1];
        userEnvGroupTwo.label.should.deep.equal(userEnvTwo.name);
        const userEnvGroupChildrenTwo: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(userEnvGroupTwo) as Array<WalletTreeItem>;
        userEnvGroupChildrenTwo[0].label.should.deep.equal(walletThreeEntry.name);
        userEnvGroupChildrenTwo[1].label.should.deep.equal(walletFourEntry.name);
    });

    it(`should display multiple groups of wallets without environmentGroups`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const userEnvTwo: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnvTwo.name = 'environmentTwo';
        userEnvTwo.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });
        const walletThreeEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet3',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet3'),
            fromEnvironment: userEnvTwo.name
        });
        const walletFourEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet4',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet4'),
            environmentGroups: [userEnvTwo.name],
            fromEnvironment: userEnvTwo.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        const getEnvironmentRegistryEntryStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get');
        getEnvironmentRegistryEntryStub.withArgs(userEnv.name).resolves(userEnv);
        getEnvironmentRegistryEntryStub.withArgs(userEnvTwo.name).resolves(userEnvTwo);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}]);
        getNodesStub.onSecondCall().resolves([{wallet: walletThreeEntry.name}, {wallet: walletFourEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        await FabricWalletRegistry.instance().add(walletThreeEntry);
        const walletThree: FabricWallet = await FabricWallet.newFabricWallet(walletThreeEntry.walletPath);
        getNewWalletStub.withArgs(walletThreeEntry).returns(walletThree);

        await FabricWalletRegistry.instance().add(walletFourEntry);
        const walletFour: FabricWallet = await FabricWallet.newFabricWallet(walletFourEntry.walletPath);
        getNewWalletStub.withArgs(walletFourEntry).returns(walletFour);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups.length.should.equal(2);

        const userEnvGroupOne: WalletTreeItem = walletGroups[0];
        userEnvGroupOne.label.should.deep.equal(userEnv.name);
        const userEnvGroupChildrenOne: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(userEnvGroupOne) as Array<WalletTreeItem>;
        userEnvGroupChildrenOne[0].label.should.deep.equal(walletOneEntry.name);
        userEnvGroupChildrenOne[1].label.should.deep.equal(walletTwoEntry.name);

        const userEnvGroupTwo: WalletTreeItem = walletGroups[1];
        userEnvGroupTwo.label.should.deep.equal(userEnvTwo.name);
        const userGroupChildrenTwo: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(userEnvGroupTwo) as Array<WalletTreeItem>;
        userGroupChildrenTwo[0].label.should.deep.equal(walletThreeEntry.name);
        userGroupChildrenTwo[1].label.should.deep.equal(walletFourEntry.name);
    });

    it(`should correctly group wallets that don't have environmentGroups`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            fromEnvironment: userEnv.name
        });
        const walletThreeEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet3',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet3'),
            fromEnvironment: userEnv.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}, {wallet: walletThreeEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        await FabricWalletRegistry.instance().add(walletThreeEntry);
        const walletThree: FabricWallet = await FabricWallet.newFabricWallet(walletThreeEntry.walletPath);
        getNewWalletStub.withArgs(walletThreeEntry).returns(walletThree);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
        walletGroupChildren[2].label.should.deep.equal(walletThreeEntry.name);
    });

    it(`should group a wallet that doesn't have environmentGroups with one that does`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            fromEnvironment: userEnv.name
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            environmentGroups: [userEnv.name]
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
    });

    it(`should group a wallet that has environmentGroups with one that doesn't`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const walletOneEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet1',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet1'),
            environmentGroups: [userEnv.name]
        });
        const walletTwoEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'wallet2',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/wallet2'),
            fromEnvironment: userEnv.name
        });

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);

        const getNodesStub: sinon.SinonStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
        getNodesStub.resolves([{wallet: walletOneEntry.name}, {wallet: walletTwoEntry.name}]);

        await FabricWalletRegistry.instance().add(walletOneEntry);
        const walletOne: FabricWallet = await FabricWallet.newFabricWallet(walletOneEntry.walletPath);
        getNewWalletStub.withArgs(walletOneEntry).returns(walletOne);

        await FabricWalletRegistry.instance().add(walletTwoEntry);
        const walletTwo: FabricWallet = await FabricWallet.newFabricWallet(walletTwoEntry.walletPath);
        getNewWalletStub.withArgs(walletTwoEntry).returns(walletTwo);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal(userEnv.name);
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(walletOneEntry.name);
        walletGroupChildren[1].label.should.deep.equal(walletTwoEntry.name);
    });

    it(`should not attempt to show a wallet in a group if the environment doesn't exist`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const myWalletEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'myWallet',
            walletPath: path.join(__dirname, '../../test/tmp/v2/wallets/myWallet'),
            environmentGroups: ['whatever'],
        });
        await FabricWalletRegistry.instance().add(myWalletEntry);
        const myWallet: FabricWallet = await FabricWallet.newFabricWallet(myWalletEntry.walletPath);
        getNewWalletStub.withArgs(myWalletEntry).returns(myWallet);

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(false);
        mySandBox.stub(FabricEnvironment.prototype, 'getNodes').resolves([{wallet: myWalletEntry.name}]);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        walletGroups[0].label.should.deep.equal('Other/shared wallets');
        const walletGroupChildren: Array<WalletTreeItem>  = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        walletGroupChildren[0].label.should.deep.equal(myWalletEntry.name);
    });

    it(`should handle error when updating walletRegistryEntries`, async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().clear();

        const userEnv: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
        userEnv.name = 'environmentOne';
        userEnv.environmentType = EnvironmentType.ENVIRONMENT;

        const userEnvWallet: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'userEnvWallet',
            walletPath: '/some/path',
            environmentGroups: [userEnv.name],
            fromEnvironment: userEnv.name
        });
        await FabricWalletRegistry.instance().add(userEnvWallet);

        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'exists').resolves(true);
        mySandBox.stub(FabricEnvironmentRegistry.instance(), 'get').resolves(userEnv);
        mySandBox.stub(FabricEnvironment.prototype, 'getNodes').rejects({ message: 'something bad has happened' });

        const updateWalletStub: sinon.SinonStub = mySandBox.stub(FabricWalletRegistry.instance(), 'update').resolves();

        await blockchainWalletExplorerProvider.getChildren();

        logSpy.should.have.been.calledOnceWith(LogType.ERROR, 'Error displaying Fabric Wallets: something bad has happened', 'Error displaying Fabric Wallets: something bad has happened');
        updateWalletStub.should.have.been.calledOnceWithExactly({
            name: userEnvWallet.name,
            walletPath: userEnvWallet.walletPath,
            environmentGroups: [],
            fromEnvironment: userEnvWallet.fromEnvironment
        });
    });

    it('should handle errors when populating the BlockchainWalletExplorer view', async () => {
        await FabricEnvironmentRegistry.instance().clear();
        await FabricWalletRegistry.instance().delete('otherWallet');

        getGreenWalletIdentityNamesStub.rejects({ message: 'something bad has happened' });
        getBlueWalletIdentityNamesStub.resolves([]);

        const walletGroups: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        const walletGroupChildren: Array<WalletTreeItem> = await blockchainWalletExplorerProvider.getChildren(walletGroups[0]) as Array<WalletTreeItem>;
        await blockchainWalletExplorerProvider.getChildren(walletGroupChildren[1]);
        logSpy.should.have.been.calledOnceWith(LogType.ERROR, 'Error displaying Fabric Wallets: something bad has happened', 'Error displaying Fabric Wallets: something bad has happened');
    });

    it('should not populate the BlockchainWalletExplorer view with wallets without wallet paths', async () => {
        getGreenWalletIdentityNamesStub.resolves([]);
        getBlueWalletIdentityNamesStub.resolves([]);
        const purpleWallet: FabricWalletRegistryEntry = new FabricWalletRegistryEntry({
            name: 'purpleWallet',
            walletPath: undefined
        });

        await FabricWalletRegistry.instance().clear();

        await TestUtil.setupLocalFabric();
        await FabricWalletRegistry.instance().add(blueWalletEntry);
        await FabricWalletRegistry.instance().add(greenWalletEntry);
        await FabricWalletRegistry.instance().add(purpleWallet);

        const mockRuntime: sinon.SinonStubbedInstance<LocalMicroEnvironment> = mySandBox.createStubInstance(LocalMicroEnvironment);
        mockRuntime.getNodes.resolves([{wallet: 'Org1'}]);
        mockRuntime.getVisibleIdentities.resolves(orgOneIdentities);
        mySandBox.stub(EnvironmentFactory, 'getEnvironment').returns(mockRuntime);

        const allChildren: Array<BlockchainTreeItem> = await blockchainWalletExplorerProvider.getChildren() as Array<WalletTreeItem>;
        allChildren.length.should.equal(2);
        allChildren[0].should.be.an.instanceof(WalletGroupTreeItem);
        allChildren[0].label.should.equal(FabricRuntimeUtil.LOCAL_FABRIC);
        ensureRuntimeStub.should.have.been.calledOnce;

        allChildren[1].should.be.an.instanceOf(WalletGroupTreeItem);
        allChildren[1].label.should.equal('Other/shared wallets');
        const groupOne: WalletGroupTreeItem = allChildren[0] as WalletGroupTreeItem;
        groupOne.wallets.length.should.equal(1);

        const localOrgOneWallet: FabricWalletRegistryEntry = await FabricWalletRegistry.instance().get('Org1', FabricRuntimeUtil.LOCAL_FABRIC);

        groupOne.wallets.should.deep.equal([localOrgOneWallet]);
        const groupOneWallets: WalletTreeItem[] = await blockchainWalletExplorerProvider.getChildren(groupOne) as WalletTreeItem[];
        groupOneWallets[0].label.should.equal(`Org1`);

        const groupTwo: WalletGroupTreeItem = allChildren[1] as WalletGroupTreeItem;
        groupTwo.wallets.length.should.equal(2);
        groupTwo.wallets.should.deep.equal([blueWalletEntry, greenWalletEntry]);
        const groupTwoWallets: WalletTreeItem[] = await blockchainWalletExplorerProvider.getChildren(groupTwo) as WalletTreeItem[];
        groupTwoWallets[0].label.should.equal(blueWalletEntry.name);
        groupTwoWallets[1].label.should.equal(greenWalletEntry.name);
    });
});
